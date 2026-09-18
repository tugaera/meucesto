import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-warning-comments": ["error", { "terms": ["todo", "fixme", "hack"], "location": "anywhere" }]
    }
  },
  globalIgnores([
    ".corepack/**",
    ".next/**",
    ".tools/**",
    "coverage/**",
    "playwright-report/**",
    "public/sw.js",
    "src/types/database.ts",
    "test-results/**"
  ])
]);
