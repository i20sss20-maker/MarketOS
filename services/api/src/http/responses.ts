import type { HttpResponseInit } from "@azure/functions";

const allowedOrigin = process.env.MARKETOS_WEB_ORIGIN?.trim() || "*";

export function json(status: number, jsonBody: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    jsonBody,
  };
}

export function marketError(error: unknown): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown market data error.";
  const status = message.startsWith("Missing ") ? 400 : 502;

  return json(status, {
    ok: false,
    error: message,
  });
}
