"use client";

import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

const BarcodeScanner = dynamic(() => import("./scanner").then((module) => module.BarcodeScanner), { ssr: false });

export function ScannerLauncher({ onResult }: { onResult: (barcode: string) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="secondary" size="icon" title={t("shopping.scan")} aria-label={t("shopping.scan")} onClick={() => setOpen(true)}><ScanLine className="h-5 w-5" aria-hidden /></Button>{open ? <BarcodeScanner onResult={(value) => { onResult(value); setOpen(false); }} onClose={() => setOpen(false)} /> : null}</>;
}
