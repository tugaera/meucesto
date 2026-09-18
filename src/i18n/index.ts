import en from "./en.json";
import pt from "./pt.json";

export const dictionaries = { en, pt } as const;
export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;
export type TranslationValues = Readonly<Record<string, string | number>>;

export function translate(locale: Locale, key: TranslationKey, values: TranslationValues = {}): string {
  const template: string = dictionaries[locale][key];
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export function toIntlLocale(locale: Locale): "en-GB" | "pt-PT" {
  return locale === "en" ? "en-GB" : "pt-PT";
}
