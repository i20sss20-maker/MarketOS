import { useEffect, useRef, useState } from "react";
import type { MarketSymbol } from "@marketos/market-core";
import { ForecastHistoryError, listServerForecasts, mergeServerForecastPages, type ServerForecastRecord } from "../lib/serverForecastApi";

export default function ServerForecastHistory({onSelectSymbol}: {onSelectSymbol: (symbol: MarketSymbol) => void}) {
  const [records, setRecords] = useState<ServerForecastRecord[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current = useRef<ServerForecastRecord[]>([]);

  async function load(nextCursor?: string) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const run = ++generation.current;
    const owns = () => !active.signal.aborted && generation.current === run;
    setLoading(true); setError(null); setLoginRequired(false);
    if (!nextCursor) { current.current = []; setRecords([]); setCursor(undefined); }
    try {
      const page = await listServerForecasts(active.signal, nextCursor);
      if (!owns()) return;
      const next = mergeServerForecastPages(current.current, page.records);
      current.current = next; setRecords(next);
      // An unchanged continuation token must not create an endless load-more loop.
      setCursor(page.cursor === nextCursor ? undefined : page.cursor);
    } catch (caught) {
      if (!owns()) return;
      // Clear even previous pages: a session could have expired or changed.
      current.current = []; setRecords([]); setCursor(undefined);
      setLoginRequired(caught instanceof ForecastHistoryError && [401, 403].includes(caught.status));
      setError(caught instanceof ForecastHistoryError ? caught.message : "تعذر الاتصال بسجل الخادم. أعد المحاولة.");
    } finally { if (owns()) setLoading(false); }
  }

  useEffect(() => {
    void load();
    const reset = () => { current.current = []; setRecords([]); setRevision(v => v + 1); };
    window.addEventListener("focus", reset);
    return () => { ++generation.current; controller.current?.abort(); window.removeEventListener("focus", reset); };
  }, [revision]);

  const date = (ms: number) => new Date(ms).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  return <section className="server-forecast-history" dir="rtl" aria-busy={loading}>
    <header><div><span>SERVER FORECAST JOURNAL</span><h2>سجل التوقعات المحفوظة</h2></div>
      <button onClick={() => setRevision(v => v + 1)} disabled={loading}>تحديث السجل</button></header>
    <p>تقارير أنشأها الخادم وحفظها لحسابك. لا تُحتسب إحصاءات المتصفح المحلية كأداء موثّق.</p>
    <aside className="server-journal-notice">التقييم الآلي لنتائج هذه التقارير على الخادم لم يُفعّل بعد. «بانتظار التقييم» لا تعني نجاح التوقع أو فشله.</aside>
    {error ? <div role="alert"><p>{error}</p>{loginRequired ? <a href="/.auth/login/aad?post_login_redirect_uri=/">تسجيل الدخول</a> : <button disabled={loading} onClick={() => setRevision(v => v + 1)}>إعادة المحاولة</button>}</div> : null}
    {loading ? <p role="status">جارٍ جلب سجل الخادم…</p> : null}
    {!loading && !error && records.length === 0 ? <p>لا توجد توقعات محفوظة في حسابك بعد. اطلب تحليلًا في وضع البيانات الحقيقية.</p> : null}
    {!error && records.map(record => <article key={record.id}>
      <header><button onClick={() => onSelectSymbol(record.forecast.symbol)}>{record.forecast.symbol.ticker}</button><span>بانتظار التقييم</span></header>
      <p>{record.forecast.symbol.name}</p>
      <small>حُفظ: {date(record.recordedAt)} · المصدر: {record.forecast.dataProvider}</small>
      <details><summary>عرض التقرير الأصلي</summary>
        <p>{record.forecast.summary}</p>
        <p>السعر المرجعي: {record.forecast.referencePrice.toLocaleString("ar-SA")} {record.forecast.symbol.currency}</p>
        <p>وقت إنشاء التحليل: {date(record.forecast.generatedAt * 1000)} · {record.forecast.engine}</p>
        <div className="server-journal-scenarios">{record.forecast.scenarios.map(s => <span key={s.id}>{s.id === "bull" ? "صعود" : s.id === "bear" ? "هبوط" : "محايد"}: {s.probability}%</span>)}</div>
        <small>معرّف التقرير: <code>{record.id.slice(0, 16)}</code>. الاحتمالات ليست ضمانًا للنتيجة.</small>
      </details>
    </article>)}
    {!error && cursor && records.length < 200 ? <button disabled={loading} onClick={() => void load(cursor)}>تحميل تقارير أقدم</button> : null}
  </section>;
}
