import type { HttpResponseInit } from "@azure/functions";

const allowedOrigin = process.env.MARKETOS_WEB_ORIGIN?.trim() || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(status: number, jsonBody: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    jsonBody,
  };
}

export function preflight(): HttpResponseInit {
  return {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "600",
    },
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
