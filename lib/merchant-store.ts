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

export type MerchantEmployee = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

export type MerchantSettings = {
  merchantName: string;
  merchantAddress: string;
  defaultCurrency: FiatCurrency;
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

const settings =
  globalThis.kaspaflowMerchantSettings ??
  (globalThis.kaspaflowMerchantSettings = loadSettings());

export function getMerchantSettings() {
  return settings;
}

export function updateMerchantSettings(
  input: Partial<Omit<MerchantSettings, "employees" | "updatedAt">>,
) {
  if (input.merchantName !== undefined) {
    if (!input.merchantName.trim()) {
      throw new Error("Merchant name is required.");
    }

    settings.merchantName = input.merchantName.trim();
  }

  if (input.merchantAddress !== undefined) {
    if (!isKaspaAddress(input.merchantAddress)) {
      throw new Error("A valid Kaspa address is required.");
    }

    settings.merchantAddress = input.merchantAddress.trim();
  }

  if (input.defaultCurrency !== undefined) {
    if (!isFiatCurrency(input.defaultCurrency)) {
      throw new Error("Unsupported fiat currency.");
    }

    settings.defaultCurrency = input.defaultCurrency;
  }

  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

export function upsertEmployee(input: Partial<MerchantEmployee>) {
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

export function setEmployeeActive(id: string, active: boolean) {
  const employee = settings.employees.find((entry) => entry.id === id);

  if (!employee) {
    throw new Error("Employee not found.");
  }

  employee.active = active;
  settings.updatedAt = new Date().toISOString();
  persistSettings();
  return settings;
}

function getSettingsPath() {
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
    return {
      ...defaultSettings,
      ...(JSON.parse(readFileSync(settingsPath, "utf8")) as MerchantSettings),
    };
  } catch {
    return defaultSettings;
  }
}

function persistSettings() {
  const settingsPath = getSettingsPath();
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(`${settingsPath}.tmp`, JSON.stringify(settings, null, 2));
  renameSync(`${settingsPath}.tmp`, settingsPath);
}
