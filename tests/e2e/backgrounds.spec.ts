import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

const photo = async () => ({
  name: "My quiet place.jpg",
  mimeType: "image/jpeg",
  buffer: await readFile("public/images/coast.jpg"),
});

async function openBackgrounds(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: null,
        services: { auth: false, database: false, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
});

test("guests import, apply, persist, reapply, delete, and reimport their own image", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes++;
  });
  await openBackgrounds(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import image", exact: true }).click();
  await (await chooser).setFiles(await photo());
  const scene = page.getByRole("button", { name: /^My quiet place .*Imported image/ });
  await expect(page.locator(".timer-card")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  await page.locator(".mobile-nav").getByRole("button", { name: "Scenes", exact: true }).click();
  await page.getByRole("button", { name: /Quiet forest Somewhere/ }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /forest.jpg/);
  await page.locator(".mobile-nav").getByRole("button", { name: "Scenes", exact: true }).click();
  await expect(scene).not.toHaveClass(/active/);
  await scene.click();
  await expect(page.locator(".timer-card")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  await page.locator(".mobile-nav").getByRole("button", { name: "Scenes", exact: true }).click();
  await expect(scene).toHaveClass(/active/);
  await page.getByRole("button", { name: "Delete My quiet place", exact: true }).click();
  await expect(scene).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /forest.jpg/);
  await page.locator(".mobile-nav").getByRole("button", { name: "Scenes", exact: true }).click();
  await page.getByLabel("Import background image").setInputFiles(await photo());
  await expect(page.locator(".timer-card")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  await page.locator(".mobile-nav").getByRole("button", { name: "Scenes", exact: true }).click();
  await expect(scene).toHaveClass(/active/);
  expect(writes).toBe(0);
});

test("invalid imports leave the current background intact and allow retry", async ({ page }) => {
  await openBackgrounds(page);
  const input = page.getByLabel("Import background image");
  for (const [file, message] of [
    [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") }, /Choose a JPG/],
    [
      { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") },
      /couldn’t be opened/,
    ],
    [{ name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) }, /image is empty/],
    [{ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(8_000_001) }, /under 8 MB/],
  ] as const) {
    await input.setInputFiles(file);
    await expect(page.locator(".toast")).toContainText(message);
    await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
    await expect(page.locator(".saved-scene")).toHaveCount(0);
  }
  await input.setInputFiles(await photo());
  await expect(page.locator(".timer-card")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await expect(page.locator(".saved-scene .scene-card")).toHaveClass(/active/);
});

test("browser storage failures do not add an unsaved image or replace the guest workspace", async ({
  page,
}) => {
  await openBackgrounds(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "pom.workspace.guest" && value.includes("data:image/"))
        throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByLabel("Import background image").setInputFiles(await photo());
  await expect(page.locator(".toast")).toContainText("Your browser couldn’t save this image");
  await expect(page.locator(".saved-scene")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /forest.jpg/);
});

test("signed-in users upload multipart images without AI and retain server errors for retry", async ({
  page,
}) => {
  const workspace = {
    preferences: {
      focus: 30,
      rest: 5,
      longRest: 15,
      theme: "sage",
      background: "forest",
      dailyGoal: 120,
      autoStart: false,
      sound: false,
    },
    tasks: [],
    sessions: [],
    backgrounds: [],
    completions: [],
  };
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", name: "Alex" },
        services: { auth: true, database: true, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
  await page.route("**/api/settings", (route) => route.fulfill({ json: { ok: true } }));
  let attempts = 0;
  await page.route("**/api/backgrounds", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("PUT");
    expect(request.headers()["content-type"]).toContain("multipart/form-data; boundary=");
    expect(
      request
        .postDataBuffer()!
        .includes(Buffer.from('name="image"; filename="My quiet place.jpg"')),
    ).toBe(true);
    attempts++;
    if (attempts === 1) {
      await route.fulfill({
        status: 409,
        json: { error: "Your library is full. Remove a background first." },
      });
      return;
    }
    const background = {
      id: "uploaded-scene",
      name: "My quiet place",
      prompt: "",
      source: "upload",
      url: "/images/coast.jpg",
      createdAt: new Date().toISOString(),
    };
    workspace.backgrounds.push(background as never);
    await route.fulfill({ json: { background } });
  });
  await openBackgrounds(page);
  await page.getByLabel("Import background image").setInputFiles(await photo());
  await expect(page.locator(".toast")).toContainText("Your library is full");
  await expect(page.locator(".saved-scene")).toHaveCount(0);
  await page.getByLabel("Import background image").setInputFiles(await photo());
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await expect(page.getByRole("button", { name: /^My quiet place .*Imported image/ })).toHaveClass(
    /active/,
  );
  await page.getByRole("button", { name: "Focus space", exact: true }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
  expect(attempts).toBe(2);
});

test("image uploads require authentication and reject cross-origin writes", async ({
  request,
  baseURL,
}) => {
  const image = await photo();
  for (const [origin, status] of [
    [baseURL!, 401],
    ["https://other.example", 403],
  ] as const) {
    const response = await request.put("/api/backgrounds", {
      headers: { origin },
      multipart: { image: { name: image.name, mimeType: image.mimeType, buffer: image.buffer } },
    });
    expect(response.status()).toBe(status);
  }
});

test("version changes require authentication and reject cross-origin writes", async ({
  request,
  baseURL,
}) => {
  for (const [origin, status] of [
    [baseURL!, 401],
    ["https://other.example", 403],
  ] as const) {
    const response = await request.patch("/api/backgrounds", {
      headers: { origin },
      data: {
        id: "00000000-0000-4000-8000-000000000000",
        versionId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(response.status()).toBe(status);
  }
});
