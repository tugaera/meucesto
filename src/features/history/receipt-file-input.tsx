"use client";

import { Camera, ImagePlus } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";

type ReceiptSource = "camera" | "library";

export function ReceiptFileInput({ id, label, hint, allowLibraryUploads }: { id: string; label: string; hint?: string; allowLibraryUploads: boolean }) {
  const { t } = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ReceiptSource>("camera");
  const [fileName, setFileName] = useState("");
  const fieldProps = hint ? { hint } : {};

  if (!allowLibraryUploads) {
    return (
      <Field label={label} htmlFor={id} {...fieldProps}>
        <Input id={id} name="receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="py-2" />
      </Field>
    );
  }

  function choose(nextSource: ReceiptSource) {
    setSource(nextSource);
    setFileName("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
    const input = nextSource === "camera" ? cameraRef.current : libraryRef.current;
    input?.click();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFileName(event.currentTarget.files?.[0]?.name ?? "");
  }

  return (
    <Field label={label} htmlFor={`${id}-camera`} {...fieldProps}>
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant={source === "camera" ? "primary" : "secondary"} onClick={() => choose("camera")}>
            <Camera className="h-4 w-4" aria-hidden />
            {t("history.takeReceiptPhoto")}
          </Button>
          <Button type="button" variant={source === "library" ? "primary" : "secondary"} onClick={() => choose("library")}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t("history.chooseReceiptImage")}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">{fileName || t("history.noReceiptImageSelected")}</p>
        <Input
          ref={cameraRef}
          id={`${id}-camera`}
          name={source === "camera" ? "receipt" : undefined}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required={source === "camera"}
          onChange={onFileChange}
          className="sr-only"
        />
        <Input
          ref={libraryRef}
          id={`${id}-library`}
          name={source === "library" ? "receipt" : undefined}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={source === "library"}
          onChange={onFileChange}
          className="sr-only"
        />
      </div>
    </Field>
  );
}
