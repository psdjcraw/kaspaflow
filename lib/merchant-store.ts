import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  DEFAULT_MERCHANT_ADDRESS,
  isFiatCurrency,
  isKaspaAddress,
  type FiatCurrency,
} from "./kaspa";
import { assertOperationalMerchantAddress } from "./merchant-address";
import {
  getPostgresMerchantSettings,
  setPostgresActiveStore,
  setPostgresEmployeeActive,
  updatePostgresMerchantSettings,
  upsertPostgresEmployee,
  upsertPostgresStore,
} from "./postgres-store";
import { assertFileStorageProvider, getStorageProvider } from "./storage-provider";

export type MerchantEmployee = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

export type MerchantStore = {
  id: string;
  name: string;
  merchantAddress: string;
  defaultCurrency: FiatCurrency;
  active: boolean;
};

export type MerchantSettings = {
  merchantName: string;
  merchantAddress: string;
  defaultCurrency: FiatCurrency;
  activeStoreId: string;
  stores: MerchantStore[];
  employees: MerchantEmployee[];
  updatedAt: string;
};

declare global {
  var kaspaflowMerchantSettings: MerchantSettings | undefined;
}

const defaultSettings: MerchantSettings = {
  merchantName: "KaspaFlow Cafe",
  merchantAddress: DEFAULT_MERCHANT_ADDRESS,
  defaultCurrency: "KRW",
  activeStoreId: "STORE-MAIN",
  stores: [
    {
      id: "STORE-MAIN",
      name: "KaspaFlow Cafe",
      merchantAddress: DEFAULT_MERCHANT_ADDRESS,
      defaultCurrency: "KRW",
      active: true,
    },
  ],
  employees: [
    {
      id: "EMP-OWNER",
      name: "Owner",
      role: "owner",
      active: true,
    },
  ],
  updatedAt: new Date().toISOString(),
};

export async function getMerchantSettings() {
  if (getStorageProvider() === "postgres") {
    return getPostgresMerchantSettings();
  }

  return getFileSettings();
}

export async function updateMerchantSettings(
  input: Partial<Omit<MerchantSettings, "employees" | "updatedAt">>,
) {
  if (input.merchantAddress !== undefined) {
    validateMerchantAddress(input.merchantAddress);
  }

  if (getStorageProvider() === "postgres") {
    return updatePostgresMerchantSettings(input);
  }

  const settings = getFileSettings();

  if (input.merchantName !== undefined) {
    if (!input.merchantName.trim()) {
      throw new Error("Merchant name is required.");
    }

    settings.merchantName = input.merchantName.trim();
  }

  if (input.merchantAddress !== undefined) {
    settings.merchantAddress = input.merchantAddress.trim();
  }

  if (input.defaultCurrency !== undefined) {
    if (!isFiatCurrency(input.defaultCurrency)) {
      throw new Error("Unsupported fiat currency.");
    }

    settings.defaultCurrency = input.defaultCurrency;
  }

  settings.updatedAt = new Date().toISOString();
  syncActiveStoreFromSettings();
  persistSettings();
  return settings;
}

export async function upsertStore(input: Partial<MerchantStore>) {
  if (getStorageProvider() === "postgres") {
    validateStoreInput(input);
    return upsertPostgresStore(input);
  }

  const settings = getFileSettings();
  const name = String(input.name ?? "").trim();
  const merchantAddress = String(input.merchantAddress ?? "").trim();
  const defaultCurrency = input.defaultCurrency ?? settings.defaultCurrency;

  if (!name) {
    throw new Error("Store name is required.");
  }

  validateMerchantAddress(merchantAddress);

  if (!isFiatCurrency(defaultCurrency)) {
    throw new Error("Unsupported fiat currency.");
  }

  const store = input.id
    ? settings.stores.find((entry) => entry.id === input.id)
    : null;

  if (store) {
    store.name = name;
    store.merchantAddress = merchantAddress;
    store.defaultCurrency = defaultCurrency;
    store.active = input.active ?? store.active;
  } else {
    settings.stores.push({
      id: `STORE-${Date.now().toString(36).toUpperCase()}`,
      name,
      merchantAddress,
      defaultCurrency,
      active: input.active ?? true,
    });
  }

  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

export async function setActiveStore(id: string) {
  if (getStorageProvider() === "postgres") {
    return setPostgresActiveStore(id);
  }

  const settings = getFileSettings();
  const store = settings.stores.find((entry) => entry.id === id);

  if (!store) {
    throw new Error("Store not found.");
  }

  settings.activeStoreId = store.id;
  settings.merchantName = store.name;
  settings.merchantAddress = store.merchantAddress;
  settings.defaultCurrency = store.defaultCurrency;
  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

export async function upsertEmployee(input: Partial<MerchantEmployee>) {
  if (getStorageProvider() === "postgres") {
    validateEmployeeInput(input);
    return upsertPostgresEmployee(input);
  }

  const settings = getFileSettings();
  const name = String(input.name ?? "").trim();
  const role = String(input.role ?? "").trim();

  if (!name) {
    throw new Error("Employee name is required.");
  }

  if (!role) {
    throw new Error("Employee role is required.");
  }

  const employee = input.id
    ? settings.employees.find((entry) => entry.id === input.id)
    : null;

  if (employee) {
    employee.name = name;
    employee.role = role;
    employee.active = input.active ?? employee.active;
  } else {
    settings.employees.push({
      id: `EMP-${Date.now().toString(36).toUpperCase()}`,
      name,
      role,
      active: input.active ?? true,
    });
  }

  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

export async function setEmployeeActive(id: string, active: boolean) {
  if (getStorageProvider() === "postgres") {
    return setPostgresEmployeeActive(id, active);
  }

  const settings = getFileSettings();
  const employee = settings.employees.find((entry) => entry.id === id);

  if (!employee) {
    throw new Error("Employee not found.");
  }

  employee.active = active;
  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

function getFileSettings() {
  return globalThis.kaspaflowMerchantSettings ??
    (globalThis.kaspaflowMerchantSettings = loadSettings());
}

function getSettingsPath() {
  assertFileStorageProvider("merchant-store");
  const dataDir =
    process.env.KASPAFLOW_DATA_DIR ?? path.join(process.cwd(), "data");

  return path.join(dataDir, "merchant-settings.json");
}

function loadSettings(): MerchantSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return defaultSettings;
  }

  try {
    const loaded = {
      ...defaultSettings,
      ...(JSON.parse(readFileSync(settingsPath, "utf8")) as MerchantSettings),
    };
    return normalizeSettings(loaded);
  } catch {
    return defaultSettings;
  }
}

function persistSettings() {
  const settingsPath = getSettingsPath();
  const settings = getFileSettings();
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(`${settingsPath}.tmp`, JSON.stringify(settings, null, 2));
  renameSync(`${settingsPath}.tmp`, settingsPath);
}

function normalizeSettings(value: MerchantSettings): MerchantSettings {
  const stores = value.stores?.length
    ? value.stores
    : [
        {
          id: value.activeStoreId || "STORE-MAIN",
          name: value.merchantName,
          merchantAddress: value.merchantAddress,
          defaultCurrency: value.defaultCurrency,
          active: true,
        },
      ];
  const activeStore = stores.find((store) => store.id === value.activeStoreId) ??
    stores[0];

  return {
    ...value,
    stores,
    activeStoreId: activeStore.id,
    merchantName: activeStore.name,
    merchantAddress: activeStore.merchantAddress,
    defaultCurrency: activeStore.defaultCurrency,
  };
}

function syncActiveStoreFromSettings() {
  const settings = getFileSettings();
  const store = settings.stores.find((entry) => entry.id === settings.activeStoreId);

  if (!store) {
    return;
  }

  store.name = settings.merchantName;
  store.merchantAddress = settings.merchantAddress;
  store.defaultCurrency = settings.defaultCurrency;
}

function validateStoreInput(input: Partial<MerchantStore>) {
  const name = String(input.name ?? "").trim();
  const merchantAddress = String(input.merchantAddress ?? "").trim();
  const defaultCurrency = input.defaultCurrency ?? "KRW";

  if (!name) {
    throw new Error("Store name is required.");
  }

  validateMerchantAddress(merchantAddress);

  if (!isFiatCurrency(defaultCurrency)) {
    throw new Error("Unsupported fiat currency.");
  }
}

function validateMerchantAddress(merchantAddress: string) {
  if (!isKaspaAddress(merchantAddress)) {
    throw new Error("A valid Kaspa address is required.");
  }

  assertOperationalMerchantAddress(merchantAddress);
}

function validateEmployeeInput(input: Partial<MerchantEmployee>) {
  const name = String(input.name ?? "").trim();
  const role = String(input.role ?? "").trim();

  if (!name) {
    throw new Error("Employee name is required.");
  }

  if (!role) {
    throw new Error("Employee role is required.");
  }
}
