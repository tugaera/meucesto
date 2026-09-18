"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode, type TouchEvent } from "react";

export function PullToRefresh({ children }: { children: ReactNode }) {
  const startY = useRef<number | null>(null);
  const router = useRouter();
  const onStart = (event: TouchEvent) => { if (window.scrollY === 0) startY.current = event.touches[0]?.clientY ?? null; };
  const onEnd = (event: TouchEvent) => {
    const endY = event.changedTouches[0]?.clientY;
    if (startY.current !== null && endY !== undefined && endY - startY.current > 90) router.refresh();
    startY.current = null;
  };
  return <div onTouchStart={onStart} onTouchEnd={onEnd}>{children}</div>;
}
