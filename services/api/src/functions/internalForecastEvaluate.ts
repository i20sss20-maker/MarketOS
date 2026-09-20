import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { hasValidWorkerSecret } from "../auth/workerSecret.js";
import { getForecastEvaluationStore } from "../forecasts/evaluationStore.js";
import { runForecastEvaluationSweep } from "../forecasts/evaluationSweep.js";
import { marketDataProvider } from "../providers/index.js";
import { realDataRequired } from "../production/policy.js";
import { json } from "../http/responses.js";

export function createForecastEvaluationHandler(deps = { store: getForecastEvaluationStore, provider: marketDataProvider }) {
  return async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (!hasValidWorkerSecret(request)) return json(401, { ok: false, error: "Invalid worker credentials." });
    if (request.method !== "POST") return json(405, { ok: false, error: "POST required." });
    if (process.env.FORECAST_EVALUATION_ENABLED !== "true") return json(200, { ok: true, enabled: false });
    if (!realDataRequired()) return json(503, { ok: false, error: "Real-data mode is required." });
    // This endpoint accepts no prices, owners, outcomes, policy or cursor from its caller.
    if (Number(request.headers.get("content-length")) > 1024) return json(413, { ok: false });
    try {
      const text = await request.text();
      if (text.length > 1024) return json(413, { ok: false });
      if (text.trim() && JSON.stringify(JSON.parse(text)) !== "{}") return json(400, { ok: false, error: "No evaluation inputs are accepted." });
    } catch { return json(400, { ok: false, error: "Invalid request." }); }
    try {
      const summary = await runForecastEvaluationSweep(deps.store(), deps.provider);
      return json(200, { ok: true, enabled: true, ...summary });
    } catch { return json(503, { ok: false, error: "Server evaluation is unavailable. No successful result is implied." }); }
  };
}
export const internalForecastEvaluate = createForecastEvaluationHandler();
app.http("internalForecastEvaluate", { methods: ["POST"], authLevel: "anonymous", route: "internal/forecasts/evaluate", handler: internalForecastEvaluate });
