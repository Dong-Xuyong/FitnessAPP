import type { Area } from "react-easy-crop";

const DEFAULT_OUTPUT = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    if (!src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/**
 * Draws the pixel crop region from imageSrc into a square canvas and returns a JPEG blob.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  options?: { outputSize?: number; quality?: number; mimeType?: "image/jpeg" | "image/png" }
): Promise<Blob> {
  const outputSize = options?.outputSize ?? DEFAULT_OUTPUT;
  const quality = options?.quality ?? 0.92;
  const mimeType = options?.mimeType ?? "image/jpeg";

  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("NO_2D_CONTEXT");
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("TO_BLOB_FAILED"));
        else resolve(blob);
      },
      mimeType,
      mimeType === "image/jpeg" ? quality : undefined
    );
  });
}
