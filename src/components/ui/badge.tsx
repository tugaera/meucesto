import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const tones = {
    neutral: "border-gray-300 bg-gray-50 text-gray-700",
    success: "border-emerald-200 bg-[var(--emerald-soft)] text-emerald-800",
    warning: "border-amber-200 bg-[var(--amber-soft)] text-amber-900",
    danger: "border-red-200 bg-[var(--coral-soft)] text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return <span className={cn("inline-flex min-h-6 items-center border px-2 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}
