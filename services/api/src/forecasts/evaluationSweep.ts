import type { MarketDataProvider } from "@marketos/market-core";
import type { ForecastEvaluationStore } from "./evaluationStore.js";
import { evaluateForecast } from "./evaluation.js";
import { assertRealProvider } from "../production/policy.js";

export async function runForecastEvaluationSweep(store: ForecastEvaluationStore, provider: MarketDataProvider, clock: () => number = Date.now) {
  assertRealProvider(provider);
  const startedAt = clock();
  const lease = await store.claim(startedAt);
  const summary = { acquired: !!lease, checked: 0, resolved: 0, pending: 0, failed: 0, hasMore: false };
  if (!lease) return summary;
  let cursor = lease.cursor;
  try {
    const page = await store.page(cursor);
    if (page.records.length > 3) throw new Error("Evaluation batch cap exceeded");
    for (const record of page.records) {
      if (clock() - startedAt > 45_000) throw new Error("Evaluation time budget exceeded");
      summary.checked++;
      try {
        if (!record.evaluationPlan || record.evaluation) { summary.pending++; continue; }
        // Do not query unrelated providers or guess a missing historical anchor.
        if (record.evaluationPlan.provider !== provider.id) throw new Error("Provider changed");
        const age = Math.max(0, clock() / 1000 - record.evaluationPlan.anchorTime);
        const step = record.evaluationPlan.timeframe === "1d" ? 86_400 : 14_400;
        const limit = Math.min(5000, Math.max(120, Math.ceil(age / step) + record.evaluationPlan.horizonBars + 4));
        const candles = await provider.getCandles(record.forecast.symbol, record.evaluationPlan.timeframe, limit);
        const decision = evaluateForecast(record, candles, provider.id, clock());
        if (decision.status === "pending") { summary.pending++; continue; }
        const saved = await store.save(record, decision.evaluation);
        if (!saved.evaluation) throw new Error("Evaluation not persisted");
        summary.resolved++;
      } catch { summary.failed++; } // Neither a provider failure nor a save failure is a win/loss.
    }
    cursor = page.cursor;
    summary.hasMore = !!cursor;
    return summary;
  } finally {
    // Persist continuation between scheduled runs; an incomplete page is retried.
    await store.finish(lease, cursor, clock());
  }
}
