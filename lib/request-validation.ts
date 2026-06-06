export const MAX_FIAT_AMOUNT = 100_000_000;
export const MAX_KAS_AMOUNT = 10_000_000;

export async function readJsonObject(request: Request) {
  const body = await request.json();

  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body;
}

export function getStringField(
  body: Record<string, unknown>,
  field: string,
  options: {
    required?: boolean;
    maxLength?: number;
    fallback?: string;
  } = {},
) {
  const rawValue = body[field] ?? options.fallback ?? "";

  if (typeof rawValue !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const value = rawValue.trim();

  if (options.required && !value) {
    throw new Error(`${field} is required.`);
  }

  if (options.maxLength && value.length > options.maxLength) {
    throw new Error(`${field} must be ${options.maxLength} characters or fewer.`);
  }

  return value;
}

export function getNumberField(
  body: Record<string, unknown>,
  field: string,
  options: {
    required?: boolean;
    fallback?: number;
    minExclusive?: number;
    maxInclusive?: number;
  } = {},
) {
  const rawValue = body[field] ?? options.fallback;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (options.required) {
      throw new Error(`${field} is required.`);
    }

    return options.fallback;
  }

  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }

  if (
    options.minExclusive !== undefined &&
    value <= options.minExclusive
  ) {
    throw new Error(`${field} must be greater than ${options.minExclusive}.`);
  }

  if (
    options.maxInclusive !== undefined &&
    value > options.maxInclusive
  ) {
    throw new Error(`${field} must be ${options.maxInclusive} or less.`);
  }

  return value;
}

export function getBooleanField(
  body: Record<string, unknown>,
  field: string,
  options: {
    required?: boolean;
    fallback?: boolean;
  } = {},
) {
  const rawValue = body[field] ?? options.fallback;

  if (rawValue === undefined || rawValue === null) {
    if (options.required) {
      throw new Error(`${field} is required.`);
    }

    return options.fallback;
  }

  if (typeof rawValue !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }

  return rawValue;
}

export function getAction<T extends string>(
  body: Record<string, unknown>,
  allowedActions: readonly T[],
  fallback: T,
) {
  const action = getStringField(body, "action", { fallback });

  if (!allowedActions.includes(action as T)) {
    throw new Error("Unsupported action.");
  }

  return action as T;
}

export function getObjectField(
  body: Record<string, unknown>,
  field: string,
) {
  const value = body[field];

  if (!isRecord(value)) {
    throw new Error(`${field} must be a JSON object.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
