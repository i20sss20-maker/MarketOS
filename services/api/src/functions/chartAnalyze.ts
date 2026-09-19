import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { analyzeChartContext, sanitizeChartContext } from "../ai/localChartEngine.js";
import { json, preflight } from "../http/responses.js";

export async function chartAnalyze(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  try {
    const payload = await request.json();
    const context = sanitizeChartContext(payload);
    const analysis = analyzeChartContext(context);

    return json(200, {
      ok: true,
      analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid chart analysis request.";
    return json(400, {
      ok: false,
      error: message,
    });
  }
}

app.http("chartAnalyze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai/chart-analyze",
  handler: chartAnalyze,
});
