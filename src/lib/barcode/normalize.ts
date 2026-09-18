export function normalizeBarcode(value: string): string | null {
  const normalized = value.trim().replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return normalized || null;
}

export interface PackageMeasurement {
  quantity: string;
  unit: "un" | "g" | "kg" | "ml" | "l" | "dose";
}

const conversions: Readonly<Record<string, { unit: PackageMeasurement["unit"]; multiplier: number }>> = {
  unit: { unit: "un", multiplier: 1 }, units: { unit: "un", multiplier: 1 }, un: { unit: "un", multiplier: 1 },
  g: { unit: "g", multiplier: 1 }, gram: { unit: "g", multiplier: 1 }, grams: { unit: "g", multiplier: 1 },
  kg: { unit: "kg", multiplier: 1 }, kilogram: { unit: "kg", multiplier: 1 }, kilograms: { unit: "kg", multiplier: 1 },
  ml: { unit: "ml", multiplier: 1 }, cl: { unit: "ml", multiplier: 10 },
  l: { unit: "l", multiplier: 1 }, litre: { unit: "l", multiplier: 1 }, liter: { unit: "l", multiplier: 1 }, litres: { unit: "l", multiplier: 1 }, liters: { unit: "l", multiplier: 1 },
  dose: { unit: "dose", multiplier: 1 }, doses: { unit: "dose", multiplier: 1 },
};

export function parsePackageMeasurement(quantityText: string | undefined, numericQuantity?: number, unitText?: string): PackageMeasurement | null {
  const directUnit = unitText?.trim().toLowerCase();
  if (numericQuantity !== undefined && directUnit && conversions[directUnit]) {
    const conversion = conversions[directUnit];
    return { quantity: String(numericQuantity * conversion.multiplier), unit: conversion.unit };
  }
  if (!quantityText) return null;
  const match = quantityText.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(units?|un|g|grams?|kg|kilograms?|ml|cl|l|litres?|liters?|doses?)\b/);
  if (!match?.[1] || !match[2]) return null;
  const conversion = conversions[match[2]];
  if (!conversion) return null;
  const quantity = Number.parseFloat(match[1].replace(",", ".")) * conversion.multiplier;
  return Number.isFinite(quantity) && quantity > 0 ? { quantity: String(quantity), unit: conversion.unit } : null;
}
