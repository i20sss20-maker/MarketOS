import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

// All responses are explicit fixtures; these checks do not use live market data.
function modules(strict) {
  const memo = new Map();
  function load(file) {
    const path = resolve(file);
    if (memo.has(path)) return memo.get(path);
    let code = ts.transpileModule(readFileSync(path, 'utf8').replaceAll('import.meta.env', JSON.stringify({
      VITE_MARKETOS_REQUIRE_REAL_DATA: strict ? 'true' : 'false', VITE_API_BASE_URL: '/api',
    })), {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
    code = code.replace(/from\s+(["'])([^"']+)\1/g, (_,q,spec) => {
      if (!spec.startsWith('.')) return `from ${JSON.stringify(spec)}`;
      return `from ${JSON.stringify(load(resolve(dirname(path), spec.replace(/\.js$/, '') + (spec.endsWith('.ts') ? '' : '.ts'))))}`;
    });
    const out='data:text/javascript;base64,'+Buffer.from(code).toString('base64');memo.set(path,out);return out;
  }
  return file => import(load('apps/web/src/lib/'+file+'.ts'));
}
const load=modules(true), previewLoad=modules(false);
const mode=await load('productionMode'), preview=await previewLoad('productionMode');
const market=await load('marketApi'), events=await load('eventsApi'), feed=await load('feedApi');
const history=await load('serverForecastApi'), ai=await load('aiApi');
const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
const symbol={id:'TEST:A',ticker:'A',name:'Test',exchange:'TEST',currency:'USD',assetClass:'stock'};
const quote={symbol:'A',price:100,timestamp:Math.floor(Date.now()/1000)-60,source:'twelvedata'};
const candle={time:quote.timestamp,open:99,high:102,low:98,close:100};
const report=()=>({id:'a'.repeat(64),forecastHash:'b'.repeat(64),recordedAt:Date.now(),evaluationStatus:'pending',
  forecast:{engine:'test',dataMode:'provider',dataProvider:'twelvedata',generatedAt:quote.timestamp,symbol,referencePrice:100,
    summary:'Test fixture, not an investment forecast',confidence:60,scenarios:[{id:'bull',probability:60},{id:'base',probability:25},{id:'bear',probability:15}]}});
const tests=[];
async function test(name,run){await run();tests.push(name);console.log('PASS '+name);}
const respond=(payload,status=200)=>{globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});};
try{
await test('strict mode never calls a fabricated-data factory',()=>{let n=0;assert.deepEqual(mode.previewOnly(()=>{n++;return [1];},[]),[]);assert.equal(n,0);});
await test('preview retains explicit Demo capability',()=>{assert.deepEqual(preview.previewOnly(()=>[1],[]),[1]);preview.assertProviderSource('browser-demo');});
await test('strict mode rejects absent and synthetic provider identities',()=>{for(const x of [null,undefined,'','demo','browser-demo','sample-provider','fallback'])assert.throws(()=>mode.assertProviderSource(x));});
await test('misconfigured or Demo status cannot become live in the browser',async()=>{
 for(const s of [{ok:true,provider:'demo',mode:'demo',configured:true},{ok:true,provider:'twelvedata',mode:'provider',configured:false}]){respond(s);await assert.rejects(()=>market.getMarketStatus());}
});
await test('valid provider status is retained',async()=>{respond({ok:true,provider:'twelvedata',mode:'provider',configured:true});assert.equal((await market.getMarketStatus()).mode,'provider');});
await test('a successful Demo API response is rejected for quotes and candles',async()=>{
 respond({ok:true,provider:'demo',quote:{...quote,source:'demo'},candles:[candle],timeframe:'1h'});
 await assert.rejects(()=>market.getMarketQuote(symbol));await assert.rejects(()=>market.getMarketCandles(symbol,'1h'));
});
await test('unknown and future quote timestamps are rejected',()=>{for(const timestamp of [0,NaN,Date.now(),quote.timestamp+900])assert.throws(()=>mode.assertQuoteData({...quote,timestamp},'twelvedata'));});
await test('mixed Demo items invalidate an overview rather than blend sources',async()=>{
 respond({ok:true,provider:'twelvedata',items:[{symbol,quote},{symbol,quote:{...quote,source:'browser-demo'}}]});await assert.rejects(()=>market.getMarketOverview([symbol]));
});
await test('missing symbols stay missing instead of acquiring synthetic prices',async()=>{respond({ok:true,provider:'twelvedata',items:[]});assert.deepEqual((await market.getMarketOverview([symbol])).items,[]);});
await test('duplicate, out-of-order and impossible OHLC bars are rejected',async()=>{
 for(const bars of [[candle,candle],[{...candle,time:candle.time+1},candle],[{...candle,high:90}],[]]){
  respond({ok:true,provider:'twelvedata',timeframe:'1h',candles:bars});await assert.rejects(()=>market.getMarketCandles(symbol,'1h'));
 }
});
await test('valid bars pass through without fabricated freshness',async()=>{respond({ok:true,provider:'twelvedata',timeframe:'1h',candles:[candle]});assert.equal((await market.getMarketCandles(symbol,'1h')).candles[0].time,candle.time);});
await test('Demo events and news are rejected including per-item fallback',async()=>{
 respond({ok:true,provider:'twelvedata',events:[{source:'demo-events'}],releases:[{source:'browser-demo-company-feed'}]});
 await assert.rejects(()=>events.getMarketEvents('2026-01-01','2026-01-02',[]));await assert.rejects(()=>feed.getCompanyFeed([symbol]));
 respond({ok:true,provider:'twelvedata',events:[{}],releases:[{}]});
 await assert.rejects(()=>events.getMarketEvents('2026-01-01','2026-01-02',[]));await assert.rejects(()=>feed.getCompanyFeed([symbol]));
});
await test('network/API failures do not yield a fake success',async()=>{
 respond({ok:false,error:'provider unavailable'},503);await assert.rejects(()=>market.getMarketQuote(symbol));
 globalThis.fetch=async()=>{throw new TypeError('network offline');};await assert.rejects(()=>history.listServerForecasts());
});
await test('server-history authorization failure produces a sign-in state',async()=>{
 for(const status of [401,403]){respond({ok:false},status);await assert.rejects(()=>history.listServerForecasts(),e=>e instanceof history.ForecastHistoryError&&e.status===status);}
});
await test('only a validated Cosmos server page is accepted',async()=>{
 respond({ok:true,storage:'cosmos',records:[report()]});assert.equal((await history.listServerForecasts()).records.length,1);
 for(const bad of [{ok:true,storage:'memory',records:[report()]},{ok:true,storage:'cosmos',records:[{...report(),evaluationStatus:'resolved'}]},{ok:true,storage:'cosmos',records:[{...report(),forecast:{...report().forecast,dataMode:'demo'}}]}]){
  respond(bad);await assert.rejects(()=>history.listServerForecasts());
 }
});
await test('invalid history records cannot crash validation or invent outcomes',()=>{
 for(const value of [null,{}, {...report(),forecast:{...report().forecast,scenarios:[null,null,null]}}])assert.equal(history.isServerForecastRecord(value),false);
});
await test('pagination is bounded and URL encoded, not interpolated unsafely',async()=>{
 let seen;globalThis.fetch=async(url,options)=>{seen={url,options};return new Response(JSON.stringify({ok:true,storage:'cosmos',records:[]}));};
 await history.listServerForecasts(undefined,'a&owner=victim');assert.equal(new URL(seen.url,'https://marketos.test').searchParams.get('cursor'),'a&owner=victim');
 assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.credentials,'same-origin');
 await assert.rejects(()=>history.listServerForecasts(undefined,'x'.repeat(8193)));
});
await test('overlapping history pages deduplicate immutable report IDs',()=>{const r=report();assert.equal(history.mergeServerForecastPages([r],[r]).length,1);assert.throws(()=>history.mergeServerForecastPages([r],[{...r,forecastHash:'c'.repeat(64)}]));});
await test('strict Analyst requires a matching server storage receipt',async()=>{
 respond({ok:true,forecast:report().forecast});await assert.rejects(()=>ai.getAnalystForecast(symbol));
 const r=report();respond({ok:true,forecast:r.forecast,journal:r});assert.equal((await ai.getAnalystForecast(symbol)).referencePrice,100);
 respond({ok:true,forecast:r.forecast,journal:{...r,forecast:{...r.forecast,symbol:{...symbol,id:'OTHER'}}}});await assert.rejects(()=>ai.getAnalystForecast(symbol));
});
await test('old browser forecasts cannot become production performance',async()=>{
 let reads=0,writes=0;globalThis.window={localStorage:{getItem(){reads++;return '[]';},setItem(){writes++;}}};
 const journal=await load('forecastJournal');assert.deepEqual(journal.loadForecastJournal(),[]);journal.saveForecastJournal([]);assert.equal(reads,0);assert.equal(writes,0);
});
await test('production Radar never reads/writes browser localStorage',async()=>{
 globalThis.window={localStorage:{getItem(){throw Error('must not read');},setItem(){throw Error('must not write');}}};
 const cache=await load('analystRadarCache');cache.resetAnalystRadarSession('owner-A');
 const item={symbol,forecast:report().forecast,direction:'bull',directionProbability:60,confidence:60,clarity:70,calibrated:false};
 cache.saveAnalystRadarCache([symbol],[item]);assert.equal(cache.loadAnalystRadarCache([symbol]).items.length,1);
 cache.resetAnalystRadarSession('owner-B');assert.equal(cache.loadAnalystRadarCache([symbol]),null);
});
await test('all App demo factories are guarded; strict history uses server API',()=>{
 const app=readFileSync('apps/web/src/App.tsx','utf8');
 for(const text of ['previewOnly(() => createDemoCandles','previewOnly(() => createDemoQuote','previewOnly(() => createBrowserDemoEvents','previewOnly(() => createBrowserDemoFeed','if (REQUIRE_REAL_DATA) return [];','!REQUIRE_REAL_DATA && missing.length > 0'])assert.ok(app.includes(text),text);
 const panel=readFileSync('apps/web/src/components/CommercialAiPanel.tsx','utf8');assert.match(panel,/REQUIRE_REAL_DATA\s*\? <ServerForecastHistory/);
 const view=readFileSync('apps/web/src/components/ServerForecastHistory.tsx','utf8');assert.doesNotMatch(view,/localStorage|loadForecastJournal/);assert.match(view,/AbortController/);assert.match(view,/generation.current === run/);
});
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/production-client-tests.json',JSON.stringify({passed:tests.length,tests,services:'mock responses, not a live Azure/data-provider test'},null,2));
console.log(`Production client: ${tests.length} scenarios passed.`);
}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
