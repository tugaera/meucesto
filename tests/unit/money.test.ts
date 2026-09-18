import { describe, expect, it } from "vitest";
import { calculateCartSavings, calculateCartTotal, calculateLineAmounts, deriveDiscount, parseLocalizedDecimal } from "@/lib/money";

describe("localized money", () => {
  it("parses Portuguese and English decimal conventions", () => {
    expect(parseLocalizedDecimal("1.234,56", "pt", 2)).toBe("1234.56");
    expect(parseLocalizedDecimal("1,234.56", "en", 2)).toBe("1234.56");
    expect(parseLocalizedDecimal("2,5", "pt")).toBe("2.5");
  });

  it("rejects negative, malformed, and over-precise values", () => {
    expect(parseLocalizedDecimal("-1,00", "pt", 2)).toBeNull();
    expect(parseLocalizedDecimal("12.50", "pt", 2)).toBeNull();
    expect(parseLocalizedDecimal("1,234", "pt", 2)).toBeNull();
  });

  it("uses decimal arithmetic for line and cart totals", () => {
    const first = calculateLineAmounts("1.005", "2", "1.50");
    const second = calculateLineAmounts("0.10", "3");
    expect(first).toEqual({ subtotal: "2.01", originalSubtotal: "3.00", savings: "0.99" });
    expect(calculateCartTotal([first, second])).toBe("2.31");
    expect(calculateCartSavings([first, second])).toBe("0.99");
  });

  it("derives equivalent discount representations", () => {
    expect(deriveDiscount({ originalPrice: "10", percentage: "25" })).toEqual({
      finalPrice: "7.50",
      originalPrice: "10.00",
      amount: "2.50",
      percentage: "25.00",
    });
    expect(deriveDiscount({ finalPrice: "8", amount: "2" })?.originalPrice).toBe("10.00");
    expect(deriveDiscount({ originalPrice: "10", percentage: "0" })?.finalPrice).toBe("10.00");
    expect(deriveDiscount({ originalPrice: "10", percentage: "100" })?.finalPrice).toBe("0.00");
    expect(deriveDiscount({ originalPrice: "10", percentage: "101" })).toBeNull();
  });

  it("keeps an entered final price fixed when the reference price changes", () => {
    expect(deriveDiscount({ finalPrice: "7.50", originalPrice: "12.00" })).toMatchObject({
      finalPrice: "7.50",
      originalPrice: "12.00",
      amount: "4.50",
      percentage: "37.50",
    });
  });
});
