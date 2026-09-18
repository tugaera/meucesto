"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { CameraOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

export function BarcodeScanner({ onResult, onClose }: { onResult: (barcode: string) => void; onClose: () => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: IScannerControls | undefined;
    if (!videoRef.current) return;
    void reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (result && !stopped) { stopped = true; onResult(result.getText()); }
    }).then((scannerControls) => { controls = scannerControls; }).catch(() => setError(true));
    return () => { stopped = true; controls?.stop(); };
  }, [onResult]);
  return (
    <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} aria-labelledby="scanner-title" className="m-auto w-[calc(100%-1rem)] max-w-lg border border-gray-700 bg-[#121916] p-0 text-white backdrop:bg-black/60">
      <section className="w-full p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 id="scanner-title" className="font-bold">{t("shopping.scan")}</h2><p className="mt-1 text-sm text-gray-300">{t("shopping.scanGuide")}</p></div><Button variant="quiet" size="icon" onClick={onClose} aria-label={t("common.close")} className="text-white hover:bg-white/10 hover:text-white"><X className="h-5 w-5" aria-hidden /></Button></div>
        {error ? <div className="mt-5 flex min-h-64 flex-col items-center justify-center border border-gray-700 text-center"><CameraOff className="h-7 w-7" aria-hidden /><p className="mt-3 max-w-xs text-sm text-gray-300">{t("shopping.scanUnsupported")}</p></div> : <video ref={videoRef} className="mt-5 aspect-[4/3] w-full bg-black object-cover" muted playsInline />}
      </section>
    </dialog>
  );
}
