import Decimal from "decimal.js";
import type { Locale } from "@/i18n";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface LineAmounts {
  subtotal: string;
  originalSubtotal: string;
  savings: string;
}

export interface DiscountValues {
  finalPrice: string;
  originalPrice: string | null;
  amount: string;
  percentage: string;
}

function decimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function canonicalDecimal(value: Decimal.Value, scale = 2): string {
  return decimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export function parseLocalizedDecimal(input: string, locale: Locale, maximumScale = 3): string | null {
  const value = input.trim().replaceAll(" ", "");
  if (!value || value.startsWith("-") || maximumScale < 0) return null;
  const decimalSeparator = locale === "pt" ? "," : ".";
  const groupingSeparator = locale === "pt" ? "." : ",";
  let normalized = value;

  if (value.includes(groupingSeparator)) {
    const groupedPattern = locale === "pt"
      ? /^\d{1,3}(?:\.\d{3})*(?:,\d+)?$/
      : /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/;
    if (!groupedPattern.test(value)) return null;
    normalized = value.replaceAll(groupingSeparator, "");
  } else if (!new RegExp(`^\\d+(?:\\${decimalSeparator}\\d+)?$`).test(value)) {
    return null;
  }

  normalized = normalized.replace(decimalSeparator, ".");
  const fractional = normalized.split(".")[1];
  if ((fractional?.length ?? 0) > maximumScale) return null;
  try {
    return decimal(normalized).toFixed(fractional?.length ?? 0);
  } catch {
    return null;
  }
}

export function calculateLineAmounts(price: Decimal.Value, quantity: Decimal.Value, originalPrice?: Decimal.Value | null): LineAmounts {
  const subtotal = decimal(price).mul(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const originalSubtotal = originalPrice === null || originalPrice === undefined
    ? subtotal
    : decimal(originalPrice).mul(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    subtotal: subtotal.toFixed(2),
    originalSubtotal: originalSubtotal.toFixed(2),
    savings: originalSubtotal.minus(subtotal).toFixed(2),
  };
}

export function calculateCartTotal(lines: readonly Pick<LineAmounts, "subtotal">[]): string {
  return lines.reduce((total, line) => total.plus(line.subtotal), decimal(0)).toFixed(2);
}

export function calculateCartSavings(lines: readonly Pick<LineAmounts, "savings">[]): string {
  return lines.reduce((total, line) => total.plus(line.savings), decimal(0)).toFixed(2);
}

export function deriveDiscount(input: {
  finalPrice?: string | null;
  originalPrice?: string | null;
  amount?: string | null;
  percentage?: string | null;
}): DiscountValues | null {
  const finalPrice = input.finalPrice ? decimal(input.finalPrice) : null;
  let originalPrice = input.originalPrice ? decimal(input.originalPrice) : null;
  const amount = input.amount ? decimal(input.amount) : null;
  const percentage = input.percentage ? decimal(input.percentage) : null;

  if (percentage && (percentage.lt(0) || percentage.gt(100))) return null;
  if (finalPrice?.lt(0) || originalPrice?.lt(0) || amount?.lt(0)) return null;
  if (!originalPrice && finalPrice && amount) originalPrice = finalPrice.plus(amount);
  if (!originalPrice && finalPrice && percentage && percentage.lt(100)) {
    originalPrice = finalPrice.div(decimal(1).minus(percentage.div(100)));
  }
  if (!originalPrice) return null;

  const resolvedFinal = finalPrice ?? (amount
    ? originalPrice.minus(amount)
    : percentage
      ? originalPrice.mul(decimal(1).minus(percentage.div(100)))
      : null);
  if (!resolvedFinal || resolvedFinal.lt(0) || resolvedFinal.gt(originalPrice)) return null;
  const resolvedAmount = originalPrice.minus(resolvedFinal);
  const resolvedPercentage = originalPrice.isZero() ? decimal(0) : resolvedAmount.div(originalPrice).mul(100);
  return {
    finalPrice: canonicalDecimal(resolvedFinal),
    originalPrice: canonicalDecimal(originalPrice),
    amount: canonicalDecimal(resolvedAmount),
    percentage: canonicalDecimal(resolvedPercentage),
  };
}

export function formatMoney(value: Decimal.Value, locale: Locale): string {
  return new Intl.NumberFormat(locale === "pt" ? "pt-PT" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(decimal(value).toNumber());
}
