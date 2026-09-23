"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { deriveDiscount, parseLocalizedDecimal } from "@/lib/money";

type DiscountBasis = "original" | "amount" | "percentage";

function localized(value: string, locale: "pt" | "en"): string {
  return locale === "pt" ? value.replace(".", ",") : value;
}

function deriveFrom(finalPrice: string, value: string, basis: DiscountBasis, locale: "pt" | "en") {
  const parsedFinal = parseLocalizedDecimal(finalPrice, locale, 2);
  const parsedValue = parseLocalizedDecimal(value, locale, 2);
  if (!parsedFinal || !parsedValue) return null;
  return deriveDiscount({
    finalPrice: parsedFinal,
    originalPrice: basis === "original" ? parsedValue : null,
    amount: basis === "amount" ? parsedValue : null,
    percentage: basis === "percentage" ? parsedValue : null,
  });
}

export function DiscountFields({
  idPrefix,
  price,
  originalPrice,
  onPriceChange,
  onOriginalPriceChange,
  priceLabel,
  required = false,
  showPrice = true,
}: {
  idPrefix: string;
  price: string;
  originalPrice: string;
  onPriceChange: (value: string) => void;
  onOriginalPriceChange: (value: string) => void;
  priceLabel: string;
  required?: boolean;
  showPrice?: boolean;
}) {
  const { t, locale } = useT();
  const initialDiscount = originalPrice ? deriveFrom(price, originalPrice, "original", locale) : null;
  const [basis, setBasis] = useState<DiscountBasis>("original");
  const [amount, setAmount] = useState(() => initialDiscount ? localized(initialDiscount.amount, locale) : "");
  const [percentage, setPercentage] = useState(() => initialDiscount ? localized(initialDiscount.percentage, locale) : "");

  function applyDerived(finalPrice: string, value: string, nextBasis: DiscountBasis): boolean {
    const derived = deriveFrom(finalPrice, value, nextBasis, locale);
    if (!derived?.originalPrice) return false;
    onOriginalPriceChange(localized(derived.originalPrice, locale));
    setAmount(localized(derived.amount, locale));
    setPercentage(localized(derived.percentage, locale));
    return true;
  }

  function clearDiscount() {
    onOriginalPriceChange("");
    setAmount("");
    setPercentage("");
  }

  return (
    <div className="grid gap-3">
      <div className={showPrice ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
        {showPrice ? (
          <Field label={priceLabel} htmlFor={`${idPrefix}-price`}>
            <Input
              id={`${idPrefix}-price`}
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                onPriceChange(event.target.value);
              }}
              onBlur={(event) => {
                const discountValue = basis === "original" ? originalPrice : basis === "amount" ? amount : percentage;
                if (discountValue) applyDerived(event.target.value, discountValue, basis);
              }}
              required={required}
            />
          </Field>
        ) : null}
      </div>
      <details className="border border-[var(--line)] bg-gray-50/60 px-3 py-2">
        <summary className="min-h-9 cursor-pointer py-1 text-sm font-semibold text-[var(--muted)]">{t("shopping.discount")}</summary>
        <div className="grid gap-3 pt-3">
          <Field label={t("shopping.originalPrice")} htmlFor={`${idPrefix}-original-price`}>
            <Input
              id={`${idPrefix}-original-price`}
              name="originalPrice"
              inputMode="decimal"
              value={originalPrice}
              onChange={(event) => {
                setBasis("original");
                onOriginalPriceChange(event.target.value);
              }}
              onBlur={(event) => {
                const nextOriginal = event.target.value;
                if (nextOriginal) applyDerived(price, nextOriginal, "original");
                else clearDiscount();
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("shopping.discountAmount")} htmlFor={`${idPrefix}-discount-amount`}>
              <Input
                id={`${idPrefix}-discount-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setBasis("amount");
                  setAmount(event.target.value);
                }}
                onBlur={(event) => {
                  if (event.target.value) applyDerived(price, event.target.value, "amount");
                }}
              />
            </Field>
            <Field label={t("shopping.discountPercent")} htmlFor={`${idPrefix}-discount-percent`}>
              <Input
                id={`${idPrefix}-discount-percent`}
                inputMode="decimal"
                value={percentage}
                onChange={(event) => {
                  setBasis("percentage");
                  setPercentage(event.target.value);
                }}
                onBlur={(event) => {
                  if (event.target.value) applyDerived(price, event.target.value, "percentage");
                }}
              />
            </Field>
          </div>
          <button type="button" className="min-h-9 justify-self-start text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]" onClick={clearDiscount}>{t("shopping.removeDiscount")}</button>
        </div>
      </details>
    </div>
  );
}
