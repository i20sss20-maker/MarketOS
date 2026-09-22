import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { analyzeChartContext, sanitizeChartContext } from "../ai/localChartEngine.js";
import { json, preflight } from "../http/responses.js";
import { ProductionGateError } from "../production/policy.js";
import { consumeProductionAiQuery } from "../usage/aiQueryQuota.js";

const MAX_CHART_ANALYSIS_BODY_BYTES = 256 * 1024;

export async function chartAnalyze(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  try {
    const contentType =
      request.headers
        .get("content-type")
        ?.toLowerCase() ??
      "";

    if (
      !contentType.startsWith(
        "application/json",
      )
    ) {
      return json(415, {
        ok: false,
        code: "JSON_REQUIRED",
        error: "JSON content is required.",
      });
    }

    const declaredLength =
      Number(
        request.headers.get(
          "content-length",
        ),
      );

    if (
      Number.isFinite(
        declaredLength,
      ) &&
      declaredLength >
        MAX_CHART_ANALYSIS_BODY_BYTES
    ) {
      return json(413, {
        ok: false,
        code: "REQUEST_TOO_LARGE",
        error: "Chart analysis request is too large.",
      });
    }

    const text =
      await request.text();

    if (
      Buffer.byteLength(
        text,
        "utf8",
      ) >
      MAX_CHART_ANALYSIS_BODY_BYTES
    ) {
      return json(413, {
        ok: false,
        code: "REQUEST_TOO_LARGE",
        error: "Chart analysis request is too large.",
      });
    }

    let payload: unknown;
    try {
      payload =
        JSON.parse(text);
    } catch {
      return json(400, {
        ok: false,
        code: "INVALID_JSON",
        error: "Invalid chart analysis JSON.",
      });
    }

    // Validate the bounded context before consuming the user's daily AI unit.
    const context =
      sanitizeChartContext(
        payload,
      );

    const usage =
      await consumeProductionAiQuery(
        request,
      );

    const analysis =
      analyzeChartContext(
        context,
      );

    return json(200, {
      ok: true,
      analysis,
      ...(usage
        ? { usage }
        : {}),
    });
  } catch (error) {
    if (
      error instanceof
      ProductionGateError
    ) {
      return json(
        error.status,
        {
          ok: false,
          code: error.code,
          error: error.message,
        },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Invalid chart analysis request.";

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
