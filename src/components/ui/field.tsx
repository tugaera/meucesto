import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const controlClass = "min-h-11 w-full border border-[var(--line)] bg-white px-3 text-base text-[var(--ink)] placeholder:text-gray-400 disabled:bg-gray-100 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(controlClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, "min-h-24 py-2", className)} {...props} />;
});

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  const describedBy = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
      <div aria-describedby={describedBy}>{children}</div>
      {hint ? <p id={`${htmlFor}-hint`} className="text-xs leading-5 text-[var(--muted)]">{hint}</p> : null}
      {error ? <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
