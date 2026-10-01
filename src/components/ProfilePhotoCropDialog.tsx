"use client";

import { useState, useCallback, useEffect } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getCroppedImageBlob } from "@/lib/crop-image-to-blob";

type ProfilePhotoCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  onPickFile: () => void;
  isSaving: boolean;
  onConfirm: (file: File) => Promise<void>;
};

export function ProfilePhotoCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onPickFile,
  isSaving,
  onConfirm,
}: ProfilePhotoCropDialogProps) {
  const { t } = useI18n();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open]);

  useEffect(() => {
    if (!imageSrc) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [imageSrc]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
    const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
    await onConfirm(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profilePhotoAdjustTitle")}</DialogTitle>
        </DialogHeader>

        {!imageSrc ? (
          <div className="flex flex-col gap-4 py-2">
            <Button type="button" variant="secondary" className="mx-auto" onClick={onPickFile}>
              {t("profilePhotoChoose")}
            </Button>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-muted">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("profilePhotoZoomLabel")}</Label>
              <Slider
                min={1}
                max={3}
                step={0.02}
                value={[zoom]}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
                disabled={isSaving}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !croppedAreaPixels}
                className="gap-2"
                aria-label={t("profilePhotoSaveCropped")}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" aria-hidden />
                )}
                <span className="sm:inline">{t("profilePhotoSaveCropped")}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
