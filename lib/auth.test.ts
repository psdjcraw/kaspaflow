import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isAdminAuthRequired, requireAdminAuth } from "./auth";

describe("admin API auth", () => {
  afterEach(() => {
    delete process.env.KASPAFLOW_ADMIN_TOKEN;
    vi.unstubAllEnvs();
  });

  it("allows requests when no admin token is configured", () => {
    delete process.env.KASPAFLOW_ADMIN_TOKEN;

    expect(requireAdminAuth(new Request("http://localhost"))).toBeNull();
  });

  it("blocks admin APIs in production when no admin token is configured", () => {
    delete process.env.KASPAFLOW_ADMIN_TOKEN;
    vi.stubEnv("NODE_ENV", "production");

    expect(isAdminAuthRequired()).toBe(true);
    expect(requireAdminAuth(new Request("http://localhost"))?.status).toBe(503);
  });

  it("allows requests with a matching admin token", () => {
    process.env.KASPAFLOW_ADMIN_TOKEN = "secret";

    expect(
      requireAdminAuth(
        new Request("http://localhost", {
          headers: {
            "x-kaspaflow-admin-token": "secret",
          },
        }),
      ),
    ).toBeNull();
    expect(
      requireAdminAuth(
        new Request("http://localhost", {
          headers: {
            cookie: "kaspaflow-admin-token=secret",
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects requests with a missing or mismatched admin token", () => {
    process.env.KASPAFLOW_ADMIN_TOKEN = "secret";

    expect(requireAdminAuth(new Request("http://localhost"))?.status).toBe(401);
    expect(
      requireAdminAuth(
        new Request("http://localhost", {
          headers: {
            authorization: "Bearer wrong",
          },
        }),
      )?.status,
    ).toBe(401);
  });
});
