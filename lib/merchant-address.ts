import { DEFAULT_MERCHANT_ADDRESS } from "./kaspa";

export function isDefaultMerchantAddress(value: string) {
  return value.trim().toLowerCase() === DEFAULT_MERCHANT_ADDRESS.toLowerCase();
}

export function assertOperationalMerchantAddress(
  address: string,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv === "production" && isDefaultMerchantAddress(address)) {
    throw new Error("Replace the default Kaspa address before production use.");
  }
}
