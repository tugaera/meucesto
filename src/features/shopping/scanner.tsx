"use client";

import { BrowserMultiFormatOneDReader, type IScannerControls } from "@zxing/browser";
import { CameraOff, CheckCircle2, Flashlight, LoaderCircle, ScanLine, Settings2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n";
import {
  BARCODE_SCANNER_SETTINGS_KEY,
  classifyScannerStartError,
  createNativeBarcodeDetector,
  createProductBarcodeHints,
  DEFAULT_BARCODE_SCANNER_SETTINGS,
  enableContinuousFocus,
  getProductCameraConstraints,
  isRoutineDecodeMiss,
  normalizeBarcodeScannerSettings,
  stopVideoStream,
  type BarcodeScannerSettings,
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

function readStoredSettings(): BarcodeScannerSettings {
  if (typeof window === "undefined") return DEFAULT_BARCODE_SCANNER_SETTINGS;
  try {
    return normalizeBarcodeScannerSettings(JSON.parse(window.localStorage.getItem(BARCODE_SCANNER_SETTINGS_KEY) ?? "null"));
  } catch {
    return DEFAULT_BARCODE_SCANNER_SETTINGS;
  }
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<BarcodeScannerSettings>(() => readStoredSettings());

  useEffect(() => { resultCallbackRef.current = onResult; }, [onResult]);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => {
    window.localStorage.setItem(BARCODE_SCANNER_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = undefined;
    stopVideoStream(videoRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    stopScanner();
    setStatus("starting");
    setShowHelp(false);
    setTorchAvailable(false);
    setTorchOn(false);

    const reader = new BrowserMultiFormatOneDReader(createProductBarcodeHints(), {
      delayBetweenScanAttempts: settings.mode === "precise" ? 90 : 160,
      delayBetweenScanSuccess: 500,
      tryPlayVideoTimeout: 8_000,
    });
    let active = true;
    let helpTimer: number | undefined;
    let resultTimer: number | undefined;
    let nativeTimer: number | undefined;
    let nativeDisabled = false;

    const finishWithBarcode = (barcode: string, scannerControls?: IScannerControls) => {
      const cleanBarcode = barcode.trim();
      if (!active || !cleanBarcode) return;
      active = false;
      scannerControls?.stop();
      controlsRef.current?.stop();
      if (nativeTimer) window.clearTimeout(nativeTimer);
      setStatus("detected");
      resultTimer = window.setTimeout(() => resultCallbackRef.current(cleanBarcode), 250);
    };

    const scheduleNativeScan = () => {
      if (!settings.nativeDetector || nativeDisabled || !active) return;
      const detector = createNativeBarcodeDetector();
      if (!detector) return;

      const scan = () => {
        if (!active) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          nativeTimer = window.setTimeout(scan, 150);
          return;
        }
        void detector.detect(video).then((results) => {
          const barcode = results.find((candidate) => candidate.rawValue?.trim())?.rawValue;
          if (barcode) {
            finishWithBarcode(barcode);
            return;
          }
          nativeTimer = window.setTimeout(scan, settings.mode === "precise" ? 140 : 240);
        }).catch(() => {
          nativeDisabled = true;
        });
      };

      nativeTimer = window.setTimeout(scan, 120);
    };

    void reader.decodeFromConstraints(getProductCameraConstraints(settings), video, (result, error, scannerControls) => {
      if (!active) return;
      if (result) {
        finishWithBarcode(result.getText(), scannerControls);
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
      scheduleNativeScan();
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
      if (nativeTimer) window.clearTimeout(nativeTimer);
      stopScanner();
    };
  }, [settings, stopScanner]);

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
            <div className="absolute right-3 top-3 flex gap-2">
              <Button variant="quiet" size="icon" onClick={() => setSettingsOpen((open) => !open)} title={t("shopping.scanSettings")} aria-label={t("shopping.scanSettings")} aria-expanded={settingsOpen} className="border-white/30 bg-black/70 text-white hover:bg-black hover:text-white"><Settings2 className="h-5 w-5" aria-hidden /></Button>
              {torchAvailable && status === "scanning" ? <Button variant="quiet" size="icon" onClick={() => void toggleTorch()} title={t(torchOn ? "shopping.scanTorchOff" : "shopping.scanTorchOn")} aria-label={t(torchOn ? "shopping.scanTorchOff" : "shopping.scanTorchOn")} className="border-white/30 bg-black/70 text-white hover:bg-black hover:text-white"><Flashlight className="h-5 w-5" aria-hidden /></Button> : null}
            </div>
            {settingsOpen ? (
              <div className="absolute inset-x-3 top-16 bg-black/90 p-3 text-sm shadow-lg">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("shopping.scanMode")}>
                  <Button variant={settings.mode === "fast" ? "primary" : "secondary"} size="compact" onClick={() => setSettings((current) => ({ ...current, mode: "fast" }))}>{t("shopping.scanFast")}</Button>
                  <Button variant={settings.mode === "precise" ? "primary" : "secondary"} size="compact" onClick={() => setSettings((current) => ({ ...current, mode: "precise" }))}>{t("shopping.scanPrecise")}</Button>
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 text-gray-100">
                  <span>{t("shopping.scanNative")}</span>
                  <input type="checkbox" className="h-5 w-5 accent-emerald-500" checked={settings.nativeDetector} onChange={(event) => setSettings((current) => ({ ...current, nativeDetector: event.target.checked }))} />
                </label>
                <label className="mt-3 flex items-center justify-between gap-3 text-gray-100">
                  <span>{t("shopping.scanHighResolution")}</span>
                  <input type="checkbox" className="h-5 w-5 accent-emerald-500" checked={settings.highResolution} onChange={(event) => setSettings((current) => ({ ...current, highResolution: event.target.checked }))} />
                </label>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </dialog>
  );
}
