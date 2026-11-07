import { NextResponse } from "next/server";
import { api, ApiError, body, db, requireUser } from "@/lib/server";
import { z } from "zod";
import sharp from "sharp";
import {
  backgroundName,
  backgroundVersions,
  MAX_BACKGROUND_FILE_BYTES,
  MAX_SAVED_BACKGROUNDS,
  selectBackgroundVersion,
  validateBackgroundFile,
} from "@/lib/backgrounds";
import { prepareBackgroundImage } from "@/lib/prepare-background-image";
import type { Background } from "@/lib/types";

export const maxDuration = 180;
export const POST = api(async (request) => {
  const userId = await requireUser();
  if (!process.env.OPENROUTER_API_KEY)
    throw new ApiError("Add an OpenRouter API key to create your own backgrounds.", 503);
  const { prompt, backgroundId } = z
    .object({
      prompt: z.string().trim().min(8, "Describe your scene in a little more detail.").max(1000),
      backgroundId: z.uuid().optional(),
    })
    .parse(await body(request));
  const database = await db();
  const backgrounds = database.collection<Background & { userId: string }>("backgrounds");
  const original = backgroundId
    ? await backgrounds.findOne(
        { id: backgroundId, userId },
        { projection: { _id: 0, userId: 0, data: 0 } },
      )
    : null;
  if (backgroundId && !original) throw new ApiError("This scene is no longer available.", 404);
  if (original?.source === "upload") throw new ApiError("Only AI scenes have editable prompts.");
  if (
    !backgroundId &&
    (await database.collection("backgrounds").countDocuments({ userId })) >= MAX_SAVED_BACKGROUNDS
  )
    throw new ApiError(
      "Your library has 50 backgrounds. Remove one to make room for something new.",
      409,
    );
  // Persisted, atomic per-user throttle protects the shared API key across server instances.
  const bucket = `${userId}:${Math.floor(Date.now() / 3600000)}`;
  await database
    .collection("generationLimits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const limit = await database
    .collection("generationLimits")
    .findOneAndUpdate(
      { _id: bucket as never },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 7200000) } },
      { upsert: true, returnDocument: "after" },
    );
  if ((limit?.count || 0) > 5)
    throw new ApiError(
      "You’ve made five requests this hour. Come back soon for another scene.",
      429,
    );
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3000",
      "X-Title": "Pom",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image",
      prompt: `Create a beautiful, calming, motivational background for a focus workspace. Cinematic composition, subtle natural colors, restful negative space, no lettering or watermarks. User’s scene: ${prompt}`,
      aspect_ratio: "16:9",
      n: 1,
    }),
    signal: AbortSignal.timeout(165000),
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 402
        ? "Your OpenRouter account needs credits to generate an image."
        : "Your scene couldn’t be generated. Check your image model or try again.",
      502,
    );
  const result = await response.json();
  const image = result.data?.[0];
  if (!image?.b64_json || !/^image\/(png|jpeg|webp)$/.test(image.media_type || "image/png"))
    throw new ApiError("The image provider didn’t return a supported image.", 502);
  const buffer = Buffer.from(image.b64_json, "base64");
  if (buffer.length > 25_000_000)
    throw new ApiError("The generated image is too large. Try another model.", 413);
  const data = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  if (data.length > 8_000_000) throw new ApiError("The generated image is too large to save.", 413);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (original) {
    const version = {
      id,
      prompt,
      url: `/api/backgrounds/${original.id}?version=${id}`,
      createdAt,
    };
    const images = database.collection("backgroundVersions");
    const imageId = `${userId}:${original.id}:${id}`;
    // Keep image bytes separate so revisions don't fill the scene's metadata document.
    await images.insertOne({ _id: imageId as never, userId, backgroundId: original.id, data });
    try {
      // Initialize legacy history once; concurrent revisions append without losing each other.
      await backgrounds.updateOne(
        { id: original.id, userId, versions: { $exists: false } },
        { $set: { versions: backgroundVersions(original) } },
      );
      const background = await backgrounds.findOneAndUpdate(
        { id: original.id, userId },
        {
          $push: { versions: version },
          $set: { prompt, url: version.url, selectedVersionId: id },
        },
        { returnDocument: "after", projection: { _id: 0, userId: 0, data: 0 } },
      );
      if (!background) throw new ApiError("This scene is no longer available.", 404);
      return NextResponse.json({ background });
    } catch (error) {
      await images.deleteOne({ _id: imageId as never, userId });
      throw error;
    }
  }
  const version = { id, prompt, url: `/api/backgrounds/${id}`, createdAt };
  const background = {
    id,
    name: prompt.slice(0, 60),
    prompt,
    url: `/api/backgrounds/${id}`,
    createdAt,
    source: "ai" as const,
    versions: [version],
    selectedVersionId: id,
  };
  await database
    .collection("backgrounds")
    .insertOne({ ...background, _id: `${userId}:${id}` as never, userId, data });
  return NextResponse.json({ background });
});
export const PATCH = api(async (request) => {
  const userId = await requireUser();
  const { id, versionId } = z
    .object({ id: z.uuid(), versionId: z.uuid() })
    .parse(await body(request));
  const backgrounds = (await db()).collection<Background & { userId: string }>("backgrounds");
  const current = await backgrounds.findOne(
    { id, userId },
    { projection: { _id: 0, userId: 0, data: 0 } },
  );
  if (!current) throw new ApiError("This scene is no longer available.", 404);
  if (!backgroundVersions(current).some((version) => version.id === versionId))
    throw new ApiError("This version is no longer available.", 404);
  const selected = selectBackgroundVersion(current, versionId);
  const background = await backgrounds.findOneAndUpdate(
    { id, userId },
    { $set: { prompt: selected.prompt, url: selected.url, selectedVersionId: versionId } },
    { returnDocument: "after", projection: { _id: 0, userId: 0, data: 0 } },
  );
  if (!background) throw new ApiError("This scene is no longer available.", 404);
  return NextResponse.json({ background });
});
export const PUT = api(async (request) => {
  const userId = await requireUser();
  if (Number(request.headers.get("content-length") || 0) > MAX_BACKGROUND_FILE_BYTES + 65_536)
    throw new ApiError("This image is too large. Choose one under 8 MB.", 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("Choose an image to import.");
  }
  const file = form.get("image");
  if (!(file instanceof File)) throw new ApiError("Choose an image to import.");
  try {
    validateBackgroundFile(file);
  } catch (error) {
    throw new ApiError((error as Error).message, file.size > MAX_BACKGROUND_FILE_BYTES ? 413 : 400);
  }
  const database = await db();
  if (
    (await database.collection("backgrounds").countDocuments({ userId })) >= MAX_SAVED_BACKGROUNDS
  )
    throw new ApiError(
      "Your library has 50 backgrounds. Remove one to make room for something new.",
      409,
    );
  let data: Buffer;
  try {
    data = await prepareBackgroundImage(file);
  } catch {
    throw new ApiError("This image couldn’t be opened. Choose a valid image under 40 megapixels.");
  }
  if (data.length > MAX_BACKGROUND_FILE_BYTES)
    throw new ApiError("This image is too large to save. Choose a smaller one.", 413);
  const id = crypto.randomUUID();
  const background = {
    id,
    name: backgroundName(file.name),
    prompt: "",
    url: `/api/backgrounds/${id}`,
    createdAt: new Date().toISOString(),
    source: "upload" as const,
  };
  await database
    .collection("backgrounds")
    .insertOne({ ...background, _id: `${userId}:${id}` as never, userId, data });
  return NextResponse.json({ background });
});
export const DELETE = api(async (request) => {
  const userId = await requireUser();
  const { id } = z.object({ id: z.uuid() }).parse(await body(request));
  const database = await db();
  await database.collection("backgrounds").deleteOne({ _id: `${userId}:${id}` as never, userId });
  await database.collection("backgroundVersions").deleteMany({ backgroundId: id, userId });
  return NextResponse.json({ ok: true });
});
