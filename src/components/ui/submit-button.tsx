"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingLabel ?? children : children}
    </Button>
  );
}
