import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import pt from "@/i18n/pt.json";
import { KNOWN_ERROR_CODES } from "@/lib/errors";

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort();

describe("translation dictionaries", () => {
  it("keeps Portuguese and English keys in parity", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps interpolation placeholders in parity", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(pt[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("translates every stable server error code", () => {
    for (const code of KNOWN_ERROR_CODES) {
      const key = `errors.${code}` as keyof typeof en;
      expect(en[key], code).toBeTypeOf("string");
      expect(pt[key], code).toBeTypeOf("string");
    }
  });
});
