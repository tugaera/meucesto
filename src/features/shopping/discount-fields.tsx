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
  const [basis, setBasis] = useState<DiscountBasis>("original");
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState("");

  function applyDerived(finalPrice: string, value: string, nextBasis: DiscountBasis) {
    const derived = deriveFrom(finalPrice, value, nextBasis, locale);
    if (!derived?.originalPrice) return;
    onOriginalPriceChange(localized(derived.originalPrice, locale));
    setAmount(localized(derived.amount, locale));
    setPercentage(localized(derived.percentage, locale));
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
                const nextPrice = event.target.value;
                onPriceChange(nextPrice);
                const discountValue = basis === "original" ? originalPrice : basis === "amount" ? amount : percentage;
                if (discountValue) applyDerived(nextPrice, discountValue, basis);
              }}
              required={required}
            />
          </Field>
        ) : null}
        <Field label={t("shopping.originalPrice")} htmlFor={`${idPrefix}-original-price`}>
          <Input
            id={`${idPrefix}-original-price`}
            name="originalPrice"
            inputMode="decimal"
            value={originalPrice}
            onChange={(event) => {
              const nextOriginal = event.target.value;
              setBasis("original");
              onOriginalPriceChange(nextOriginal);
              if (nextOriginal) applyDerived(price, nextOriginal, "original");
              else clearDiscount();
            }}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("shopping.discountAmount")} htmlFor={`${idPrefix}-discount-amount`}>
          <Input
            id={`${idPrefix}-discount-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              const nextAmount = event.target.value;
              setBasis("amount");
              setAmount(nextAmount);
              if (nextAmount) applyDerived(price, nextAmount, "amount");
              else clearDiscount();
            }}
          />
        </Field>
        <Field label={t("shopping.discountPercent")} htmlFor={`${idPrefix}-discount-percent`}>
          <Input
            id={`${idPrefix}-discount-percent`}
            inputMode="decimal"
            value={percentage}
            onChange={(event) => {
              const nextPercentage = event.target.value;
              setBasis("percentage");
              setPercentage(nextPercentage);
              if (nextPercentage) applyDerived(price, nextPercentage, "percentage");
              else clearDiscount();
            }}
          />
        </Field>
      </div>
    </div>
  );
}
