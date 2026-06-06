import { describe, expect, it } from "vitest";

import {
  getAction,
  getBooleanField,
  getNumberField,
  getStringField,
  readJsonObject,
} from "./request-validation";

describe("request validation helpers", () => {
  it("reads JSON objects and rejects arrays", async () => {
    await expect(
      readJsonObject(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true });

    await expect(
      readJsonObject(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify([]),
        }),
      ),
    ).rejects.toThrow("Request body must be a JSON object.");
  });

  it("validates strings, numbers, booleans, and actions", () => {
    const body = {
      action: "status",
      active: false,
      amount: "1000",
      name: " Cafe ",
    };

    expect(getStringField(body, "name", { required: true })).toBe("Cafe");
    expect(getNumberField(body, "amount", {
      minExclusive: 0,
      maxInclusive: 1000,
    })).toBe(1000);
    expect(getBooleanField(body, "active", { required: true })).toBe(false);
    expect(getAction(body, ["upsert", "status"] as const, "upsert")).toBe(
      "status",
    );
  });

  it("rejects invalid request values", () => {
    expect(() =>
      getStringField({ name: "" }, "name", { required: true })
    ).toThrow("name is required.");
    expect(() =>
      getStringField({ name: "abcd" }, "name", { maxLength: 3 })
    ).toThrow("name must be 3 characters or fewer.");
    expect(() =>
      getNumberField({ amount: 0 }, "amount", { minExclusive: 0 })
    ).toThrow("amount must be greater than 0.");
    expect(() =>
      getBooleanField({ active: "false" }, "active", { required: true })
    ).toThrow("active must be a boolean.");
    expect(() =>
      getAction({ action: "delete" }, ["upsert", "status"] as const, "upsert")
    ).toThrow("Unsupported action.");
  });
});
