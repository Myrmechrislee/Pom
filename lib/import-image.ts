import { MAX_BACKGROUND_PIXELS, validateBackgroundFile } from "./backgrounds";

export async function importImageLocally(file: File) {
  validateBackgroundFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("This image couldn’t be opened. Choose another file.");
    }
    if (image.naturalWidth * image.naturalHeight > MAX_BACKGROUND_PIXELS)
      throw new Error("This image is too large. Choose one under 40 megapixels.");
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn’t prepare this image. Please try again.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (dataUrl === "data:,") throw new Error("This image couldn’t be saved. Choose another file.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
