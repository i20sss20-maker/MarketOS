import { timingSafeEqual } from "node:crypto";
import type { HttpRequest } from "@azure/functions";

function safeCompare(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function hasValidWorkerSecret(
  request: HttpRequest,
) {
  const expected =
    process.env.MARKETOS_WORKER_SECRET?.trim() ?? "";
  const supplied =
    request.headers.get("x-marketos-worker-secret")?.trim() ?? "";

  if (expected.length < 32 || supplied.length < 32) {
    return false;
  }

  return safeCompare(supplied, expected);
}
