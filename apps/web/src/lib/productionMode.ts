// Public build flag only. Credentials always stay in the server environment.
export const REQUIRE_REAL_DATA = import.meta.env?.VITE_MARKETOS_REQUIRE_REAL_DATA === "true";

export function previewOnly<T>(factory: () => T, unavailable: T): T {
  return REQUIRE_REAL_DATA ? unavailable : factory();
}

export function assertProviderSource(provider: unknown, source: unknown = provider) {
  if (!REQUIRE_REAL_DATA) return;
  if (typeof provider !== "string" || !provider.trim() || /demo|sample|fallback|unknown/i.test(provider) ||
      typeof source !== "string" || !source.trim() || /demo|sample|fallback|unknown/i.test(source)) {
    throw new Error("البيانات التجريبية غير مسموحة في وضع التشغيل الحقيقي. تعذر التحقق من المصدر.");
  }
}

export function assertQuoteData(quote: {price: number; timestamp: number; source?: string}, provider: string) {
  if (!REQUIRE_REAL_DATA) return;
  assertProviderSource(provider, quote?.source);
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 ||
      !Number.isSafeInteger(quote.timestamp) || quote.timestamp <= 0 || quote.timestamp > Date.now()/1000 + 300 ||
      quote.source !== provider) {
    throw new Error("السعر أو وقت مصدره غير صالح؛ لم يتم استبداله بسعر تجريبي.");
  }
}
