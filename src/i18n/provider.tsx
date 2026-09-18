"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type TranslationKey, type TranslationValues } from "./index";

interface TranslationContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  depth: number;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);
const localeDepthAttribute = "data-meu-cesto-locale-depth";

function applyDocumentLocale(locale: Locale, depth: number): void {
  document.documentElement.lang = locale === "pt" ? "pt-PT" : "en-GB";
  document.documentElement.setAttribute(localeDepthAttribute, String(depth));
  window.localStorage.setItem("meu-cesto-locale", locale);
}

export function I18nProvider({ children, initialLocale = "pt" }: { children: ReactNode; initialLocale?: Locale }) {
  const parent = useContext(TranslationContext);
  const depth = (parent?.depth ?? -1) + 1;
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    const activeDepth = Number(document.documentElement.getAttribute(localeDepthAttribute) ?? "-1");
    if (!Number.isFinite(activeDepth) || depth >= activeDepth) applyDocumentLocale(locale, depth);
    return () => {
      const currentDepth = Number(document.documentElement.getAttribute(localeDepthAttribute) ?? "-1");
      if (currentDepth !== depth) return;
      if (parent) applyDocumentLocale(parent.locale, parent.depth);
      else document.documentElement.removeAttribute(localeDepthAttribute);
    };
  }, [depth, locale, parent]);
  const t = useCallback((key: TranslationKey, values?: TranslationValues) => translate(locale, key, values), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, depth }), [depth, locale, t]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useT(): TranslationContextValue {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useT must be used inside I18nProvider");
  return context;
}
