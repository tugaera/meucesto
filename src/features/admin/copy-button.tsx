"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

export function CopyButton({ value }: { value: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="secondary" size="icon" title={t(copied ? "common.copied" : "common.copy")} aria-label={t(copied ? "common.copied" : "common.copy")} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}</Button>;
}
