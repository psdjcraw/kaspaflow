export function getSimulationStatus() {
  const configured = process.env.KASPAFLOW_ENABLE_SIMULATION === "true";
  const blockedInProduction = configured && process.env.NODE_ENV === "production";

  return {
    configured,
    enabled: configured && !blockedInProduction,
    blockedInProduction,
  };
}

export function isSimulationEnabled() {
  return getSimulationStatus().enabled;
}
