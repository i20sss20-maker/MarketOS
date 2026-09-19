import type { HttpRequest } from "@azure/functions";

export type AuthenticatedUser = {
  userId: string;
  identityProvider: string;
  userDetails: string;
  roles: string[];
};

type ClientPrincipalPayload = {
  identityProvider?: unknown;
  userId?: unknown;
  userDetails?: unknown;
  userRoles?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function parseRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

export function getAuthenticatedUser(
  request: HttpRequest,
): AuthenticatedUser | null {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as ClientPrincipalPayload;

    const userId = cleanText(payload.userId, 160);
    const identityProvider = cleanText(payload.identityProvider, 80);
    const userDetails = cleanText(payload.userDetails, 240);
    const roles = parseRoles(payload.userRoles);

    if (!userId || !roles.includes("authenticated")) return null;

    return {
      userId,
      identityProvider: identityProvider || "unknown",
      userDetails,
      roles,
    };
  } catch {
    return null;
  }
}
