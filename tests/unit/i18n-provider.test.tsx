// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/provider";

describe("document locale ownership", () => {
  it("lets the deepest active provider control the html language", async () => {
    const view = render(
      <I18nProvider initialLocale="pt">
        <I18nProvider initialLocale="en"><span>content</span></I18nProvider>
      </I18nProvider>,
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("en-GB"));
    expect(window.localStorage.getItem("meu-cesto-locale")).toBe("en");
    view.unmount();
  });
});
