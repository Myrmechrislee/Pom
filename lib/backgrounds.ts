import type { Background, BackgroundVersion } from "./types";

export const BACKGROUND_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_BACKGROUND_FILE_BYTES = 8_000_000;
export const MAX_BACKGROUND_PIXELS = 40_000_000;
export const MAX_SAVED_BACKGROUNDS = 50;

// Older scenes already contain the original version's metadata.
export function backgroundVersions(background: Background): BackgroundVersion[] {
  return background.versions?.length
    ? background.versions
    : [
        {
          id: background.id,
          prompt: background.prompt,
          url: background.url,
          createdAt: background.createdAt,
        },
      ];
}

export function selectBackgroundVersion(background: Background, versionId: string): Background {
  const versions = backgroundVersions(background);
  const version = versions.find((version) => version.id === versionId);
  if (!version) throw new Error("This version is no longer available.");
  return {
    ...background,
    prompt: version.prompt,
    url: version.url,
    selectedVersionId: version.id,
    versions,
  };
}

export function validateBackgroundFile(file: Pick<File, "type" | "size">) {
  if (!BACKGROUND_IMAGE_TYPES.includes(file.type))
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  if (!file.size) throw new Error("This image is empty. Choose another file.");
  if (file.size > MAX_BACKGROUND_FILE_BYTES)
    throw new Error("This image is too large. Choose one under 8 MB.");
}

export function backgroundName(filename: string) {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 60) || "Imported image"
  );
}
