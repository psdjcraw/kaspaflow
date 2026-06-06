import { afterEach, describe, expect, it, vi } from "vitest";

import { getSimulationStatus, isSimulationEnabled } from "./simulation";

describe("simulation mode status", () => {
  afterEach(() => {
    delete process.env.KASPAFLOW_ENABLE_SIMULATION;
    vi.unstubAllEnvs();
  });

  it("is disabled by default", () => {
    expect(getSimulationStatus()).toEqual({
      configured: false,
      enabled: false,
      blockedInProduction: false,
    });
  });

  it("is enabled in non-production when configured", () => {
    process.env.KASPAFLOW_ENABLE_SIMULATION = "true";
    vi.stubEnv("NODE_ENV", "development");

    expect(isSimulationEnabled()).toBe(true);
    expect(getSimulationStatus().blockedInProduction).toBe(false);
  });

  it("is blocked in production even when configured", () => {
    process.env.KASPAFLOW_ENABLE_SIMULATION = "true";
    vi.stubEnv("NODE_ENV", "production");

    expect(isSimulationEnabled()).toBe(false);
    expect(getSimulationStatus()).toEqual({
      configured: true,
      enabled: false,
      blockedInProduction: true,
    });
  });
});
