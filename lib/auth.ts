import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function requireAdminAuth(request: Request) {
  const configuredToken = process.env.KASPAFLOW_ADMIN_TOKEN;

  if (!configuredToken) {
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

function getProvidedToken(request: Request) {
  const urlToken = new URL(request.url).searchParams.get("adminToken");

  if (urlToken) {
    return urlToken;
  }

  const explicitHeader = request.headers.get("x-kaspaflow-admin-token");

  if (explicitHeader) {
    return explicitHeader;
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}

function safeTokenEqual(providedToken: string, configuredToken: string) {
  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
