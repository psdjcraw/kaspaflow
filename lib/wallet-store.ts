import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { isKaspaAddress } from "./kaspa";
import { getKaspaNetwork, type KaspaNetwork } from "./kaspa-network";

export type WalletAddressRecord = {
  id: string;
  label: string;
  address: string;
  storeId?: string;
  network: KaspaNetwork;
  active: boolean;
  createdAt: string;
};

type WalletState = {
  addresses: WalletAddressRecord[];
};

declare global {
  var kaspaflowWalletStore: WalletState | undefined;
}

const walletStore =
  globalThis.kaspaflowWalletStore ??
  (globalThis.kaspaflowWalletStore = loadWalletStore());

export function listWalletAddresses() {
  return walletStore.addresses
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertWalletAddress(
  input: Partial<WalletAddressRecord>,
) {
  const label = String(input.label ?? "").trim();
  const address = String(input.address ?? "").trim();
  const network = input.network ?? getKaspaNetwork();

  if (!label) {
    throw new Error("Wallet label is required.");
  }

  if (!isKaspaAddress(address)) {
    throw new Error("A valid Kaspa address is required.");
  }

  if (network === "testnet-10" && !address.startsWith("kaspatest:")) {
    throw new Error("testnet-10 wallet entries require a kaspatest: address.");
  }

  const existing = input.id
    ? walletStore.addresses.find((entry) => entry.id === input.id)
    : null;

  if (existing) {
    existing.label = label;
    existing.address = address;
    existing.storeId = input.storeId;
    existing.network = network;
    existing.active = input.active ?? existing.active;
  } else {
    walletStore.addresses.unshift({
      id: `WAL-${Date.now().toString(36).toUpperCase()}`,
      label,
      address,
      storeId: input.storeId,
      network,
      active: input.active ?? true,
      createdAt: new Date().toISOString(),
    });
  }

  persistWalletStore();
  return listWalletAddresses();
}

export function setWalletAddressActive(id: string, active: boolean) {
  const entry = walletStore.addresses.find((address) => address.id === id);

  if (!entry) {
    throw new Error("Wallet address not found.");
  }

  entry.active = active;
  persistWalletStore();
  return listWalletAddresses();
}

function getWalletStorePath() {
  const dataDir =
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data");

  return path.join(dataDir, "wallet-addresses.json");
}

function loadWalletStore(): WalletState {
  const storePath = getWalletStorePath();

  if (!existsSync(storePath)) {
    return { addresses: [] };
  }

  try {
    return JSON.parse(readFileSync(storePath, "utf8")) as WalletState;
  } catch {
    return { addresses: [] };
  }
}

function persistWalletStore() {
  const storePath = getWalletStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(`${storePath}.tmp`, JSON.stringify(walletStore, null, 2));
  renameSync(`${storePath}.tmp`, storePath);
}
