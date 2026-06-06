import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function requireAdminAuth(request: Request) {
  const configuredToken = process.env.KASPAFLOW_ADMIN_TOKEN;

  if (!configuredToken) {
    if (isAdminAuthRequired()) {
      return NextResponse.json(
        { error: "KASPAFLOW_ADMIN_TOKEN is required in production." },
        { status: 503 },
      );
    }

    return null;
  }

  const providedToken = getProvidedToken(request);

  if (providedToken && safeTokenEqual(providedToken, configuredToken)) {
    return null;
  }

  return NextResponse.json(
    { error: "Admin token is required." },
    { status: 401 },
  );
}

export function isAdminAuthEnabled() {
  return Boolean(process.env.KASPAFLOW_ADMIN_TOKEN);
}

export function isAdminAuthRequired() {
  return process.env.NODE_ENV === "production";
}

function getProvidedToken(request: Request) {
  const explicitHeader = request.headers.get("x-kaspaflow-admin-token");

  if (explicitHeader) {
    return explicitHeader;
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const cookieToken = getCookieValue(
    request.headers.get("cookie"),
    "kaspaflow-admin-token",
  );

  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(name.length + 1));
}

function safeTokenEqual(providedToken: string, configuredToken: string) {
  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
