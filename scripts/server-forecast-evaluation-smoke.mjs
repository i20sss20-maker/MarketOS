import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

// Every provider/database response in this suite is a test fixture. No cloud writes.
const originalEnv = {...process.env}, originalFetch = globalThis.fetch;
const dataUrl = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const azure = dataUrl(`export const registered=[]; export const app={http(){},timer(name,options){registered.push({name,options});}};
export class HttpRequest { constructor(i){this.method=i.method;this.url=i.url;this.headers=new Headers(i.headers);this.query=new URL(i.url).searchParams;this.body=i.body?.string??'';} async text(){return this.body;} async json(){return JSON.parse(this.body);} }
export default {app,HttpRequest};`);
const overrides = new Map([
 ['@azure/functions', azure],
 ['@azure/cosmos', dataUrl(`export class CosmosClient { constructor(){throw new Error('Live Cosmos is forbidden in this suite');}}`)],
 [resolve('services/api/src/providers/index.ts'), dataUrl(`export const marketDataProvider={id:'test-provider',getStatus:()=>({provider:'test-provider',mode:'provider',configured:true,supportsQuotes:true,supportsCandles:true})};`)],
]);
const memo=new Map();
function moduleUrl(path){
 path=resolve(path);if(overrides.has(path))return overrides.get(path);if(memo.has(path))return memo.get(path);
 let source=readFileSync(path,'utf8').replaceAll('import.meta.env','({VITE_API_BASE_URL:"/api"})');
 let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from\s+(["'])([^"']+)\1/g,(_,q,spec)=>`from ${JSON.stringify(overrides.get(spec)??(spec.startsWith('.')?moduleUrl(resolve(dirname(path),spec.replace(/\.js$/,'').replace(/\.ts$/,'')+'.ts')):spec))}`);
 const url=dataUrl(code);memo.set(path,url);return url;
}
const load=path=>import(moduleUrl(path));
const { makeEvaluationPlan, evaluateForecast, digest }=await load('services/api/src/forecasts/evaluation.ts');
const { createForecastRecord, publicForecastRecord }=await load('services/api/src/forecasts/ledger.ts');
const { CosmosForecastEvaluationStore }=await load('services/api/src/forecasts/evaluationStore.ts');
const { runForecastEvaluationSweep }=await load('services/api/src/forecasts/evaluationSweep.ts');
const { createForecastEvaluationHandler }=await load('services/api/src/functions/internalForecastEvaluate.ts');
const { isServerForecastRecord, mergeServerForecastPages, serverForecastToJournalRecord, serverForecastsToJournalRecords }=await load('apps/web/src/lib/serverForecastApi.ts');
const { HttpRequest }=await import(azure);
const tests=[];
async function test(name,action){await action();tests.push(name);console.log('PASS '+name);}
const base=1_780_000_000, step=14400;
const symbol={id:'TEST:A',ticker:'A',name:'Fixture',exchange:'TEST',assetClass:'crypto',currency:'USD'};
const bar=(time,close=100,open=100)=>({time,open,high:Math.max(open,close)+1,low:Math.min(open,close)-1,close,volume:10});
function fixture(){
 const f={engine:'test',symbol,generatedAt:base+1800,dataProvider:'test-provider',dataMode:'provider',referencePrice:100,summary:'Fixture',confidence:60,
  calibration:{timeframe:'4h',lookaheadBars:2,outcomeThresholdPercent:1},scenarios:[{id:'bull',probability:60},{id:'base',probability:25},{id:'bear',probability:15}]};
 const p=makeEvaluationPlan(f,[bar(base)],{symbol:'A',price:100,timestamp:base+900,source:'test-provider'});
 return createForecastRecord('owner-a','a'.repeat(64),f,(base+1801)*1000,p);
}
const candles=[bar(base),bar(base+step,102),bar(base+step*10,103),bar(base+step*11,900)];
const now=(base+step*11+301)*1000;
const resolveResult=(r=fixture(),data=candles,time=now)=>evaluateForecast(r,data,'test-provider',time);

try {
await test('calibrated plan is frozen at creation and original report remains unchanged',()=>{
 const r=fixture(),old=digest(r.forecast);assert.equal(r.evaluationPlan.horizonBars,2);assert.equal(r.planHash,digest(r.evaluationPlan));
 const p=structuredClone(r.evaluationPlan);const copied=createForecastRecord(r.userId,r.id,r.forecast,r.recordedAt,p);p.horizonBars=99;assert.equal(copied.evaluationPlan.horizonBars,2);
 resolveResult(r);assert.equal(digest(r.forecast),old);assert.equal(r.evaluation,undefined);
});
await test('no plan is manufactured for missing calibration or unknown quote time',()=>{
 const r=fixture(),q={symbol:'A',price:100,timestamp:base,source:'test-provider'};
 assert.equal(makeEvaluationPlan({...r.forecast,calibration:undefined},[bar(base)],q),undefined);
 assert.equal(makeEvaluationPlan(r.forecast,[bar(base)],{...q,timestamp:0}),undefined);
 assert.equal(makeEvaluationPlan(r.forecast,[bar(base)],{...q,source:'demo'}),undefined);
});
await test('recorded benchmark uses the original report precision without rejecting precise provider quotes',()=>{
 const f={...fixture().forecast,referencePrice:100.1235};
 const plan=makeEvaluationPlan(f,[bar(base)],{symbol:'A',price:100.123456,timestamp:base+900,source:'test-provider'});
 assert.equal(plan.referencePrice,100.1235);
});
await test('legacy record remains pending without retrospective scoring',()=>{
 const r=fixture();delete r.evaluationPlan;assert.deepEqual(resolveResult(r),{status:'pending',reason:'no-plan'});
});
await test('exact future bar count crosses session gaps and ignores today price',()=>{
 const r=fixture(),result=resolveResult(r);assert.equal(result.status,'resolved');assert.equal(result.evaluation.targetBarTime,base+step*10);
 assert.equal(result.evaluation.evaluationPrice,103);assert.ok(Math.abs(result.evaluation.realizedReturnPercent-3)<1e-9);
 assert.equal(result.evaluation.correct,true);assert.ok(Math.abs(result.evaluation.brierScore-0.245)<1e-9);
 assert.equal(result.evaluation.confirmedAt,now);
});
await test('last candle is never considered final without a successor',()=>{
 assert.deepEqual(resolveResult(fixture(),candles.slice(0,3),now+1e9),{status:'pending',reason:'not-final'});
});
await test('settlement buffer and nominal intraday duration are respected',()=>{
 assert.equal(resolveResult(fixture(),candles,(candles[3].time+299)*1000).status,'pending');
 assert.equal(resolveResult(fixture(),candles,(candles[3].time+300)*1000).status,'resolved');
});
await test('missing anchor cannot silently shift evaluation into a newer window',()=>{
 assert.deepEqual(resolveResult(fixture(),candles.slice(1)),{status:'pending',reason:'history-missing'});
});
await test('changed anchor open blocks scoring across a revision or adjustment',()=>{
 assert.deepEqual(resolveResult(fixture(),[bar(base,100,50),...candles.slice(1)]),{status:'pending',reason:'source-revision'});
});
await test('duplicate, reversed, future and invalid bars are rejected',()=>{
 for(const data of [[candles[0],candles[0]], [...candles].reverse(),[...candles,bar(now/1000+1)], [{...candles[0],high:10}], [{...candles[0],volume:-1}],[]])assert.throws(()=>resolveResult(fixture(),data));
});
await test('provider, snapshot hash and plan hash are bound to the result',()=>{
 assert.throws(()=>evaluateForecast(fixture(),candles,'other',now));
 const r=fixture();r.forecast.referencePrice=500;assert.throws(()=>resolveResult(r));
 const p=fixture();p.evaluationPlan.horizonBars=3;assert.throws(()=>resolveResult(p));
 const h=fixture();h.planHash='0'.repeat(64);assert.throws(()=>resolveResult(h));
});
await test('threshold boundaries are neutral despite floating point noise',()=>{
 for(const price of [99,101])assert.equal(resolveResult(fixture(),[candles[0],candles[1],bar(candles[2].time,price),candles[3]]).evaluation.realizedOutcome,'base');
 assert.equal(resolveResult(fixture(),[candles[0],candles[1],bar(candles[2].time,97),candles[3]]).evaluation.realizedOutcome,'bear');
});
await test('daily exchange labels wait through the full date plus conservative timezone bound',()=>{
 const r=fixture();r.forecast.calibration={timeframe:'1d',lookaheadBars:1,outcomeThresholdPercent:1};
 const d=Math.floor(base/86400)*86400;r.forecast.generatedAt=d+3600;
 const p=makeEvaluationPlan(r.forecast,[bar(d)],{symbol:'A',price:100,timestamp:d+60,source:'test-provider'});
 const record=createForecastRecord('owner','b'.repeat(64),r.forecast,(d+3601)*1000,p);
 const bars=[bar(d),bar(d+86400,104),bar(d+86400*2)];
 assert.equal(evaluateForecast(record,bars,'test-provider',(d+86400*2+301)*1000).status,'pending');
 assert.equal(evaluateForecast(record,bars,'test-provider',(d+86400+38*3600+300)*1000).status,'resolved');
});
await test('a historical target predating report issuance cannot be scored',()=>{
 const r=fixture();r.forecast.generatedAt=base+step*20;r.evaluationPlan.issuedAt=r.forecast.generatedAt;
 r.forecastHash=digest(r.forecast);r.planHash=digest(r.evaluationPlan);
 assert.equal(resolveResult(r,candles,(base+step*30)*1000).status,'pending');
});
await test('server receipt validates computed return, direction and Brier, not an injected success',()=>{
 const r=fixture();r.evaluation=resolveResult(r).evaluation;const publicRecord=publicForecastRecord(r);assert.equal(isServerForecastRecord(publicRecord),true);
 for(const change of [{correct:false},{realizedReturnPercent:90},{brierScore:0},{forecastHash:'0'.repeat(64)},{provider:'demo'}])assert.equal(isServerForecastRecord({...publicRecord,evaluation:{...publicRecord.evaluation,...change}}),false);
});
await test('server history rejects invalid confidence before performance conversion',()=>{
 const r=publicForecastRecord(fixture());
 for(const confidence of [-1,101,Number.NaN])assert.equal(isServerForecastRecord({...r,forecast:{...r.forecast,confidence}}),false);
});
await test('history transitions pending to resolved and never rolls a stored result back',()=>{
 const r=fixture(),pending=publicForecastRecord(r);r.evaluation=resolveResult(r).evaluation;const resolved=publicForecastRecord(r);
 assert.equal(mergeServerForecastPages([pending],[resolved])[0].evaluationStatus,'resolved');
 assert.equal(mergeServerForecastPages([resolved],[pending])[0].evaluationStatus,'resolved');
 assert.throws(()=>mergeServerForecastPages([resolved],[{...resolved,evaluation:{...resolved.evaluation,correct:false}}]));
});
await test('server forecast records convert into provider performance records without inventing outcomes',()=>{
 const r=fixture(),pending=publicForecastRecord(r),pendingJournal=serverForecastToJournalRecord(pending);
 assert.equal(pendingJournal.status,'pending');assert.equal(pendingJournal.dataMode,'provider');
 assert.equal(pendingJournal.engine,'test');assert.equal(pendingJournal.evaluationBars,2);assert.equal(pendingJournal.evaluationTimeframe,'4h');
 assert.equal(pendingJournal.expectedOutcome,'bull');assert.equal(pendingJournal.correct,undefined);
 r.evaluation=resolveResult(r).evaluation;const resolved=serverForecastToJournalRecord(publicForecastRecord(r));
 assert.equal(resolved.status,'resolved');assert.equal(resolved.correct,true);assert.equal(resolved.realizedOutcome,'bull');
 assert.equal(resolved.realizedReturnPercent,3);assert.equal(resolved.evaluationPrice,103);
 assert.equal(resolved.evaluatedAt,Math.floor(now/1000));
});
await test('server performance conversion preserves newest-first order and pending current engine context',()=>{
 const old=fixture();old.id='1'.repeat(64);old.forecast.generatedAt-=100;old.evaluationPlan.issuedAt=old.forecast.generatedAt;old.forecastHash=digest(old.forecast);old.planHash=digest(old.evaluationPlan);
 const latest=fixture();latest.id='2'.repeat(64);latest.forecast.engine='test-next';latest.forecastHash=digest(latest.forecast);
 const journal=serverForecastsToJournalRecords([publicForecastRecord(old),publicForecastRecord(latest)]);
 assert.equal(journal.length,2);assert.equal(journal[0].engine,'test-next');assert.equal(journal[0].status,'pending');
});

// Conditional writes and leased checkpoint, implemented with an explicitly in-memory SDK double.
const database=new Map();let sequence=0, lastOptions;
const key=(id,owner)=>owner+':'+id;
const save=doc=>{const copy=structuredClone({...doc,_etag:String(++sequence)});database.set(key(doc.id,doc.userId),copy);return {resource:copy};};
const fakeContainer={
 read:async()=>({resource:{partitionKey:{paths:['/userId']}}}),
 item:(id,owner)=>({
  read:async()=>{const r=database.get(key(id,owner));if(!r)throw {code:404};return {resource:structuredClone(r)};},
  replace:async(doc,options)=>{const old=database.get(key(id,owner));lastOptions=options;if(!old||old._etag!==options?.accessCondition?.condition)throw {code:412};return save(doc);},
 }),
 items:{create:async doc=>{if(database.has(key(doc.id,doc.userId)))throw {code:409};return save(doc);},
  query:(query,options)=>({fetchNext:async()=>{assert.equal(query.parameters[0].value,'marketos-forecast-v1');
   const records=[...database.values()].filter(r=>r.kind==='marketos-forecast-v1'&&r.evaluationPlan&&!r.evaluation).sort((a,b)=>a.recordedAt-b.recordedAt);
   lastOptions=options;return {resources:structuredClone(records.slice(0,options.maxItemCount)),continuationToken:records.length>options.maxItemCount?'cursor-next':undefined};}})},
};
const store=new CosmosForecastEvaluationStore(fakeContainer);
await test('shared sweep lease permits only one caller across concurrent requests',async()=>{
 const leases=await Promise.all([store.claim(now),store.claim(now)]);assert.equal(leases.filter(Boolean).length,1);
 assert.equal(await store.claim(now+1000),null);
});
await test('stale lease cannot advance the new owner checkpoint',async()=>{
 const old=[...database.values()].find(r=>r.kind==='forecast-evaluation-control-v1');
 const newer=await store.claim(now+151000);assert.ok(newer);
 await store.finish({token:old.token,cursor:undefined},'wrong',now+152000);
 assert.notEqual([...database.values()].find(r=>r.kind==='forecast-evaluation-control-v1').cursor,'wrong');
 await store.finish(newer,'next-page',now+153000);
 assert.equal([...database.values()].find(r=>r.kind==='forecast-evaluation-control-v1').cursor,'next-page');
 assert.equal(await store.claim(now+153001),null);
 const resumed=await store.claim(now+153000+900000);assert.equal(resumed.cursor,'next-page');
});
await test('competing evaluations save once without changing the original forecast',async()=>{
 const r=fixture();await store.create(r);const result=resolveResult(r).evaluation;
 const outcomes=await Promise.all([store.save(r,result),store.save(r,{...result,evidenceHash:'f'.repeat(64)})]);
 assert.deepEqual(outcomes[0].evaluation,outcomes[1].evaluation);
 assert.equal(digest((await store.find(r.userId,r.id)).forecast),r.forecastHash);
 assert.equal(lastOptions.accessCondition.type,'IfMatch');
});
await test('an existing result is never overwritten by a second run',async()=>{
 const r=fixture(),existing=await store.find(r.userId,r.id);const result={...resolveResult(r).evaluation,evaluationPrice:999};
 assert.deepEqual((await store.save(r,result)).evaluation,existing.evaluation);
});
await test('stored snapshots from a different owner or changed hash cannot be evaluated',async()=>{
 const r=fixture();await assert.rejects(()=>store.save({...r,userId:'other'},resolveResult(r).evaluation));
 await assert.rejects(()=>store.save({...r,forecastHash:'changed'},resolveResult(r).evaluation));
});
await test('evaluation query is bounded and excludes legacy/resolved documents',async()=>{
 for(let i=0;i<5;i++)await store.create({...fixture(),id:String(i),recordedAt:now+i});
 const page=await store.page('token');assert.equal(page.records.length,3);assert.equal(lastOptions.maxItemCount,3);
 assert.equal(lastOptions.continuationToken,'token');assert.equal(page.cursor,'cursor-next');
});
const provider={id:'test-provider',getStatus:()=>({provider:'test-provider',mode:'provider',configured:true,supportsQuotes:true,supportsCandles:true}),getCandles:async()=>candles};
let finished, calls=0;
const batchStore={claim:async()=>({token:'lease',cursor:'page-1'}),page:async()=>({records:[fixture()],cursor:'page-2'}),save:async(r,e)=>({...r,evaluation:e}),finish:async(l,c)=>{finished=c;}};
await test('bounded sweep persists a real result and continuation for the next invocation',async()=>{
 const result=await runForecastEvaluationSweep(batchStore,provider,()=>now);assert.equal(result.resolved,1);assert.equal(result.failed,0);assert.equal(finished,'page-2');
});
await test('unavailable or unfinished evidence stays pending, never counted as wrong',async()=>{
 const result=await runForecastEvaluationSweep(batchStore,{...provider,getCandles:async()=>candles.slice(0,3)},()=>now);
 assert.equal(result.resolved,0);assert.equal(result.pending,1);assert.equal(result.failed,0);
});
await test('provider and persistence failures cannot count as successful resolution',async()=>{
 for(const [s,p] of [[batchStore,{...provider,getCandles:async()=>{throw Error('provider');}}],[{...batchStore,save:async()=>{throw Error('storage');}},provider]]){
  const result=await runForecastEvaluationSweep(s,p,()=>now);assert.equal(result.resolved,0);assert.equal(result.failed,1);
 }
});
await test('a held lease performs no market request or database sweep',async()=>{
 const result=await runForecastEvaluationSweep({...batchStore,claim:async()=>null},{...provider,getCandles:async()=>{calls++;return candles;}},()=>now);
 assert.equal(result.acquired,false);assert.equal(calls,0);
});
await test('oversize batch fails and retains the old checkpoint for retry',async()=>{
 await assert.rejects(()=>runForecastEvaluationSweep({...batchStore,page:async()=>({records:Array(4).fill(fixture()),cursor:'bad'})},provider,()=>now));
 assert.equal(finished,'page-1');
});

process.env.MARKETOS_WORKER_SECRET='s'.repeat(40);process.env.MARKETOS_REQUIRE_REAL_DATA='true';
const request=(body={},secret='s'.repeat(40))=>new HttpRequest({method:'POST',url:'https://marketos.test/api/internal/forecasts/evaluate',headers:{'x-marketos-worker-secret':secret,'content-type':'application/json'},body:{string:JSON.stringify(body)}});
let storeCalls=0;const handler=createForecastEvaluationHandler({provider,store:()=>{storeCalls++;return {...batchStore,claim:async()=>null};}});
await test('internal endpoint authenticates before checking flags or touching the store',async()=>{
 assert.equal((await handler(request({},'wrong'))).status,401);assert.equal(storeCalls,0);
});
await test('evaluation remains disabled by default with no database or provider calls',async()=>{
 delete process.env.FORECAST_EVALUATION_ENABLED;const response=await handler(request());assert.equal(response.jsonBody.enabled,false);assert.equal(storeCalls,0);
});
await test('caller cannot supply a price, result, owner or continuation token',async()=>{
 process.env.FORECAST_EVALUATION_ENABLED='true';
 for(const body of [{price:1},{outcome:'bull'},{userId:'other'},{cursor:'x'}])assert.equal((await handler(request(body))).status,400);
 assert.equal(storeCalls,0);
});
await test('a valid internal call is bounded by the shared distributed lease',async()=>{
 const response=await handler(request());assert.equal(response.status,200);assert.equal(response.jsonBody.acquired,false);assert.equal(storeCalls,1);
});
await test('internal failures never echo credentials or owner identifiers',async()=>{
 const bad=createForecastEvaluationHandler({provider,store:()=>{throw Error('SECRET=do-not-print');}});
 const response=await bad(request());assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(response),/do-not-print/);
});
process.env.FORECAST_EVALUATION_ENABLED='true';
const worker=await load('services/alert-worker/src/functions/forecastEvaluationTimer.ts');
await test('worker timer is opt-in, monitored, and never runs on startup',async()=>{
 const {registered}=await import(azure);const timer=registered.find(x=>x.name==='forecastEvaluationTimer');
 assert.equal(timer.options.schedule,'0 */15 * * * *');assert.equal(timer.options.runOnStartup,false);assert.equal(timer.options.useMonitor,true);
});
await test('worker sends no scoring input and refuses redirects with its credential',async()=>{
 process.env.MARKETOS_FORECAST_EVALUATION_URL='https://marketos.test/api/internal/forecasts/evaluate';let seen;
 globalThis.fetch=async(url,opts)=>{seen={url,opts};return new Response(JSON.stringify({ok:true,enabled:true,acquired:false}));};
 await worker.forecastEvaluationTimer({}, {log(){}});assert.equal(seen.opts.redirect,'error');assert.equal(seen.opts.body,'{}');assert.ok(seen.opts.signal);
});
await test('worker rejects cleartext, credentials, alternate path and query in endpoint',async()=>{
 for(const address of ['http://marketos.test/api/internal/forecasts/evaluate','https://user:pass@marketos.test/api/internal/forecasts/evaluate','https://marketos.test/other','https://marketos.test/api/internal/forecasts/evaluate?token=x']){
  process.env.MARKETOS_FORECAST_EVALUATION_URL=address;await assert.rejects(()=>worker.forecastEvaluationTimer({}, {log(){}}));
 }
});
await test('disabled timer exits before network even with missing configuration',async()=>{
 delete process.env.FORECAST_EVALUATION_ENABLED;globalThis.fetch=async()=>{throw Error('must not run');};await worker.forecastEvaluationTimer({}, {log(){}});
});

process.env.MARKETOS_REQUIRE_REAL_DATA='true';
const {TwelveDataMarketDataProvider}=await load('services/api/src/providers/twelveDataProvider.ts');
const payload={meta:{symbol:'A',interval:'4h',mic_code:'TEST'},values:[{datetime:'2026-01-01 00:00:00',open:'100',high:'102',low:'99',close:'101'}]};
const reply=value=>{globalThis.fetch=async()=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});};
await test('provider adapter verifies actual instrument, interval and requested MIC',async()=>{
 const input={...symbol,micCode:'TEST'};reply(payload);assert.equal((await new TwelveDataMarketDataProvider('test-fixture-key').getCandles(input,'4h')).length,1);
 for(const meta of [{...payload.meta,symbol:'OTHER'},{...payload.meta,interval:'1day'},{...payload.meta,mic_code:'WRONG'},undefined]){
  reply({...payload,meta});await assert.rejects(()=>new TwelveDataMarketDataProvider('test-fixture-key').getCandles(input,'4h'));
 }
});
await test('strict parsing cannot silently remove a malformed candle and shorten the horizon',async()=>{
 reply({...payload,values:[...payload.values,{datetime:'2026-01-01 04:00:00',open:'bad',high:'102',low:'99',close:'101'}]});
 await assert.rejects(()=>new TwelveDataMarketDataProvider('test-fixture-key').getCandles(symbol,'4h'));
});
await test('strict quote identity mismatch is not relabelled as the requested symbol',async()=>{
 reply({symbol:'OTHER',timestamp:base,close:'100'});await assert.rejects(()=>new TwelveDataMarketDataProvider('test-fixture-key').getQuote(symbol));
});

mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/server-evaluation-tests.json',JSON.stringify({passed:tests.length,tests,mode:'test doubles; no live Cosmos, market provider or scheduler activation'},null,2));
console.log(`Server evaluation: ${tests.length} runtime scenarios passed; no live services used.`);
}finally{for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);globalThis.fetch=originalFetch;}
