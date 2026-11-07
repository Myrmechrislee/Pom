import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareBackgroundImage } from "../lib/prepare-background-image";
import { backgroundVersions, selectBackgroundVersion } from "../lib/backgrounds";
import type { Background } from "../lib/types";

test("existing AI scenes retain their original metadata when history is first opened", () => {
  const original: Background = {
    id: "original",
    name: "Quiet lake",
    prompt: "A quiet lake at sunrise",
    url: "/api/backgrounds/original",
    createdAt: "2026-11-07T10:00:00.000Z",
  };
  assert.deepEqual(backgroundVersions(original), [
    {
      id: original.id,
      prompt: original.prompt,
      url: original.url,
      createdAt: original.createdAt,
    },
  ]);
  assert.equal(original.versions, undefined);
});

test("selecting an older version restores its image and prompt without losing later versions", () => {
  const versions = [
    {
      id: "original",
      prompt: "Lake at sunrise",
      url: "/original.webp",
      createdAt: "2026-11-07T10:00:00.000Z",
    },
    {
      id: "revision",
      prompt: "Lake at sunset",
      url: "/sunset.webp",
      createdAt: "2026-11-07T11:00:00.000Z",
    },
    {
      id: "latest",
      prompt: "Lake at night",
      url: "/night.webp",
      createdAt: "2026-11-07T12:00:00.000Z",
    },
  ];
  const background: Background = {
    ...versions[0],
    name: "Quiet lake",
    prompt: versions[2].prompt,
    url: versions[2].url,
    versions,
    selectedVersionId: "latest",
    source: "ai",
  };
  const restored = selectBackgroundVersion(background, "original");
  assert.equal(restored.id, background.id);
  assert.equal(restored.name, background.name);
  assert.equal(restored.createdAt, background.createdAt);
  assert.equal(restored.prompt, versions[0].prompt);
  assert.equal(restored.url, versions[0].url);
  assert.equal(restored.selectedVersionId, "original");
  assert.deepEqual(restored.versions, versions);
  assert.equal(background.selectedVersionId, "latest");
  assert.equal(selectBackgroundVersion(restored, "revision").url, "/sunset.webp");
  assert.throws(
    () => selectBackgroundVersion(background, "another-scene-version"),
    /no longer available/,
  );
});

test("imported photos are oriented, resized, and saved without their original metadata", async () => {
  const photo = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: "#687b62" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await prepareBackgroundImage(
    new File([new Uint8Array(photo)], "photo.jpg", { type: "image/jpeg" }),
  );
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 1920);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("PNG, WebP, and GIF imports become valid still backgrounds without enlarging", async () => {
  for (const format of ["png", "webp", "gif"] as const) {
    const image = await sharp({
      create: { width: 32, height: 24, channels: 4, background: "#789aa2" },
    })
      .toFormat(format)
      .toBuffer();
    const result = await prepareBackgroundImage(
      new File([new Uint8Array(image)], `photo.${format}`, { type: `image/${format}` }),
    );
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 24);
    assert.ok(!metadata.pages || metadata.pages === 1);
  }
});

test("corrupt images, disguised SVGs, oversized files, and empty images cannot be imported", async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  for (const file of [
    new File(["not an image"], "photo.png", { type: "image/png" }),
    new File([svg], "photo.png", { type: "image/png" }),
    new File([svg], "photo.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(8_000_001)], "large.jpg", { type: "image/jpeg" }),
    new File([], "empty.png", { type: "image/png" }),
  ]) {
    await assert.rejects(prepareBackgroundImage(file));
  }
});
