import sharp from "sharp";
import { MAX_BACKGROUND_PIXELS, validateBackgroundFile } from "./backgrounds";

export async function prepareBackgroundImage(file: File) {
  validateBackgroundFile(file);
  const image = sharp(Buffer.from(await file.arrayBuffer()), {
    limitInputPixels: MAX_BACKGROUND_PIXELS,
  });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp", "gif"].includes(metadata.format || ""))
    throw new Error("Unsupported image format");
  return image
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}
