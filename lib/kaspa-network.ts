import "server-only";

export type KaspaNetwork = "mainnet" | "testnet-10";

const NETWORK_REST_API_URLS: Record<KaspaNetwork, string> = {
  mainnet: "https://api.kaspa.org",
  "testnet-10": "https://api-tn10.kaspa.org",
};

export function getKaspaNetwork(): KaspaNetwork {
  return process.env.KASPA_NETWORK === "testnet-10" ? "testnet-10" : "mainnet";
}

export function getKaspaRestApiUrl() {
  return process.env.KASPA_REST_API_URL || NETWORK_REST_API_URLS[getKaspaNetwork()];
}

export function buildKaspaRestUrl(pathname: string) {
  const baseUrl = getKaspaRestApiUrl();

  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}
