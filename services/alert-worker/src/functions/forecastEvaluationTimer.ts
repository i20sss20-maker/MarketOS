import { app, type InvocationContext, type Timer } from "@azure/functions";

/** Independent, opt-in timer in the existing worker, not in the SWA HTTP API. */
export async function forecastEvaluationTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  if (process.env.FORECAST_EVALUATION_ENABLED !== "true") return;
  const secret = process.env.MARKETOS_WORKER_SECRET?.trim() ?? "";
  const address = process.env.MARKETOS_FORECAST_EVALUATION_URL?.trim() ?? "";
  let endpoint: URL;
  try {
    endpoint = new URL(address);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        endpoint.pathname !== "/api/internal/forecasts/evaluate") throw new Error();
  } catch { throw new Error("Configure the MarketOS HTTPS forecast evaluation endpoint."); }
  if (secret.length < 32) throw new Error("Configure the worker secret before enabling evaluation.");
  const response = await fetch(endpoint, { method: "POST", redirect: "error",
    headers: { "content-type": "application/json", "x-marketos-worker-secret": secret }, body: "{}",
    signal: AbortSignal.timeout(90_000) });
  const result = await response.json().catch(() => null) as { ok?: boolean; enabled?: boolean; acquired?: boolean; checked?: number; resolved?: number; failed?: number } | null;
  if (!response.ok || !result?.ok) throw new Error("Forecast evaluation endpoint failed.");
  context.log("MarketOS forecast evaluation", { enabled: result.enabled, acquired: result.acquired,
    checked: result.checked, resolved: result.resolved, failed: result.failed });
}
if (process.env.FORECAST_EVALUATION_ENABLED === "true") app.timer("forecastEvaluationTimer", {
  schedule: "0 */15 * * * *", runOnStartup: false, useMonitor: true, handler: forecastEvaluationTimer,
});
