import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-[var(--emerald-dark)] bg-[var(--emerald-dark)] text-white hover:bg-[var(--emerald-deep)]",
        secondary: "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-gray-50",
        danger: "border-[var(--danger)] bg-[var(--danger)] text-white hover:bg-[#a63530]",
        quiet: "border-transparent bg-transparent text-[var(--muted)] hover:bg-gray-100 hover:text-[var(--ink)]",
      },
      size: {
        default: "h-11",
        icon: "h-11 w-11 p-0",
        compact: "h-9 min-h-9 px-3",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };
