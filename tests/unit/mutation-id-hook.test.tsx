// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMutationId } from "@/lib/actions/use-mutation-id";

describe("mutation id lifecycle", () => {
  it("keeps an id across failures and rotates it after a distinct success", () => {
    const idle = { success: false };
    const failed = { success: false };
    const succeeded = { success: true };
    const hook = renderHook(({ result }) => useMutationId(result), { initialProps: { result: idle } });
    const initial = hook.result.current;

    hook.rerender({ result: failed });
    expect(hook.result.current).toBe(initial);
    hook.rerender({ result: succeeded });
    expect(hook.result.current).not.toBe(initial);
  });
});
