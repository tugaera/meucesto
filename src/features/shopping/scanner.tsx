"use client";

import { BrowserMultiFormatOneDReader, type IScannerControls } from "@zxing/browser";
import { CameraOff, CheckCircle2, Flashlight, LoaderCircle, ScanLine, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n";
import {
  classifyScannerStartError,
  createProductBarcodeHints,
  enableContinuousFocus,
  isRoutineDecodeMiss,
  PRODUCT_CAMERA_CONSTRAINTS,
  stopVideoStream,
  type ScannerStartError,
} from "@/lib/barcode/scanner";

type ScannerStatus = "starting" | "scanning" | "detected" | "error";

const errorMessageKeys: Record<ScannerStartError | "decode", TranslationKey> = {
  permission: "shopping.scanPermissionDenied",
  "no-camera": "shopping.scanNoCamera",
  busy: "shopping.scanCameraBusy",
  unsupported: "shopping.scanUnsupported",
  unknown: "shopping.scanError",
  decode: "shopping.scanError",
};

export function BarcodeScanner({ onResult, onClose }: { onResult: (barcode: string) => void; onClose: () => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controlsRef = useRef<IScannerControls | undefined>(undefined);
  const resultCallbackRef = useRef(onResult);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [errorReason, setErrorReason] = useState<ScannerStartError | "decode">("unknown");
  const [showHelp, setShowHelp] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => { resultCallbackRef.current = onResult; }, [onResult]);
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = undefined;
    stopVideoStream(videoRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reader = new BrowserMultiFormatOneDReader(createProductBarcodeHints(), {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 500,
      tryPlayVideoTimeout: 8_000,
    });
    let active = true;
    let helpTimer: number | undefined;
    let resultTimer: number | undefined;

    void reader.decodeFromConstraints(PRODUCT_CAMERA_CONSTRAINTS, video, (result, error, scannerControls) => {
      if (!active) return;
      if (result) {
        const barcode = result.getText().trim();
        if (!barcode) return;
        active = false;
        scannerControls.stop();
        setStatus("detected");
        resultTimer = window.setTimeout(() => resultCallbackRef.current(barcode), 250);
        return;
      }
      if (error && !isRoutineDecodeMiss(error)) {
        active = false;
        scannerControls.stop();
        setErrorReason("decode");
        setStatus("error");
      }
    }).then((scannerControls) => {
      if (!active) {
        scannerControls.stop();
        return;
      }
      controlsRef.current = scannerControls;
      setTorchAvailable(Boolean(scannerControls.switchTorch));
      setStatus("scanning");
      helpTimer = window.setTimeout(() => setShowHelp(true), 7_000);
      void enableContinuousFocus(video).catch(() => undefined);
    }).catch((error: unknown) => {
      if (!active) return;
      active = false;
      stopVideoStream(video);
      setErrorReason(classifyScannerStartError(error));
      setStatus("error");
    });

    return () => {
      active = false;
      if (helpTimer) window.clearTimeout(helpTimer);
      if (resultTimer) window.clearTimeout(resultTimer);
      stopScanner();
    };
  }, [stopScanner]);

  const close = () => {
    stopScanner();
    onClose();
  };

  const toggleTorch = async () => {
    const switchTorch = controlsRef.current?.switchTorch;
    if (!switchTorch) return;
    try {
      await switchTorch(!torchOn);
      setTorchOn((current) => !current);
    } catch {
      setTorchAvailable(false);
      setTorchOn(false);
    }
  };

  const statusMessage = status === "starting"
    ? t("shopping.scanStarting")
    : status === "detected"
      ? t("shopping.scanDetected")
      : showHelp
        ? t("shopping.scanHelp")
        : t("shopping.scanSearching");

  return (
    <dialog ref={dialogRef} onCancel={close} onClose={onClose} aria-labelledby="scanner-title" className="m-auto w-[calc(100%-1rem)] max-w-lg border border-gray-700 bg-[#121916] p-0 text-white backdrop:bg-black/60">
      <section className="w-full p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 id="scanner-title" className="font-bold">{t("shopping.scan")}</h2><p className="mt-1 text-sm text-gray-300">{t("shopping.scanGuide")}</p></div><Button variant="quiet" size="icon" onClick={close} aria-label={t("common.close")} className="text-white hover:bg-white/10 hover:text-white"><X className="h-5 w-5" aria-hidden /></Button></div>
        {status === "error" ? (
          <div className="mt-5 flex min-h-64 flex-col items-center justify-center border border-red-900 bg-red-950/30 px-5 text-center" role="alert">
            {errorReason === "permission" || errorReason === "no-camera" || errorReason === "busy" ? <CameraOff className="h-7 w-7" aria-hidden /> : <TriangleAlert className="h-7 w-7" aria-hidden />}
            <p className="mt-3 max-w-sm text-sm text-gray-100">{t(errorMessageKeys[errorReason])}</p>
            <Button variant="secondary" className="mt-5" onClick={close}>{t("shopping.manualBarcode")}</Button>
          </div>
        ) : (
          <div className="relative mt-5 overflow-hidden border border-gray-700 bg-black">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-[8%] top-1/2 h-[34%] -translate-y-1/2 border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" aria-hidden />
            <div className="absolute inset-x-3 bottom-3 flex min-h-11 items-center gap-3 bg-black/80 px-3 py-2 text-sm" role="status" aria-live="polite">
              {status === "starting" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden /> : status === "detected" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden /> : <ScanLine className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden />}
              <span className="leading-5">{statusMessage}</span>
            </div>
            {torchAvailable && status === "scanning" ? <Button variant="quiet" size="icon" onClick={() => void toggleTorch()} title={t(torchOn ? "shopping.scanTorchOff" : "shopping.scanTorchOn")} aria-label={t(torchOn ? "shopping.scanTorchOff" : "shopping.scanTorchOn")} className="absolute right-3 top-3 border-white/30 bg-black/70 text-white hover:bg-black hover:text-white"><Flashlight className="h-5 w-5" aria-hidden /></Button> : null}
          </div>
        )}
      </section>
    </dialog>
  );
}
