import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("border border-[var(--line)] bg-[var(--surface)]", className)}>{children}</section>;
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-[var(--ink)] sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center border border-[var(--line)] bg-gray-50 text-[var(--muted)]">{icon}</div>
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
