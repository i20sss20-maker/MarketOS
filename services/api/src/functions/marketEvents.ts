import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, marketError, preflight } from "../http/responses.js";
import { marketEventsProvider } from "../events/index.js";
import { authorizeProductionMarketRequest } from "../production/marketAccess.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 14;

function dateValue(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

export async function marketEvents(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return preflight();

  try {
    await authorizeProductionMarketRequest(request);
    const body = await request.json() as {
      startDate?: unknown;
      endDate?: unknown;
      symbols?: unknown;
    } | null;

    const startDate = typeof body?.startDate === "string" ? body.startDate : "";
    const endDate = typeof body?.endDate === "string" ? body.endDate : "";

    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
      return json(400, { ok: false, error: "Valid startDate and endDate are required." });
    }

    const start = dateValue(startDate);
    const end = dateValue(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return json(400, { ok: false, error: "Invalid event date range." });
    }

    const rangeDays = Math.floor((end - start) / 86_400_000);
    if (rangeDays > MAX_RANGE_DAYS) {
      return json(400, {
        ok: false,
        error: `Event date range cannot exceed ${MAX_RANGE_DAYS} days.`,
      });
    }

    const symbols = Array.isArray(body?.symbols)
      ? body.symbols
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];

    const events = await marketEventsProvider.getEvents({
      startDate,
      endDate,
      symbols,
    });

    return json(200, {
      ok: true,
      provider: marketEventsProvider.id,
      generatedAt: Math.floor(Date.now() / 1000),
      startDate,
      endDate,
      events,
    });
  } catch (error) {
    return marketError(error);
  }
}

app.http("marketEvents", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "market/events",
  handler: marketEvents,
});
