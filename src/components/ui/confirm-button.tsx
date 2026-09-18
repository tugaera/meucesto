"use client";

import { Button, type ButtonProps } from "./button";

export function ConfirmButton({ confirmMessage, ...props }: ButtonProps & { confirmMessage: string }) {
  return <Button {...props} onClick={(event) => { if (!window.confirm(confirmMessage)) event.preventDefault(); }} />;
}
