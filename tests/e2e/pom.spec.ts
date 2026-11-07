import { test, expect } from "@playwright/test";
import { localDateKey } from "../../lib/stats";
import { emptyWorkspace } from "../../lib/types";

async function openPom(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}
async function settings(page: import("@playwright/test").Page) {
  await page.locator(".sidebar").getByRole("button", { name: "Settings", exact: true }).click();
}
test("dashboard rhythm settings persist and schedule a long break after the chosen session count", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  const rhythm = page.getByRole("region", { name: "Your focus rhythm", exact: true });
  await expect(rhythm).toBeVisible();
  await expect(page.getByRole("button", { name: "Timer settings", exact: true })).toBeVisible();
  await expect(
    rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }),
  ).toHaveValue("4");
  await rhythm.getByRole("spinbutton", { name: "Focus time", exact: true }).fill("1");
  await rhythm.getByRole("spinbutton", { name: "Short break", exact: true }).fill("2");
  await rhythm.getByRole("spinbutton", { name: "Long break", exact: true }).fill("3");
  await rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }).fill("2");
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("01:00");
  await expect(page.locator(".session-dots")).toHaveAttribute("aria-label", "Session 1 of 2");
  await page.reload();
  await expect(rhythm.getByRole("spinbutton", { name: "Focus time", exact: true })).toHaveValue(
    "1",
  );
  await expect(rhythm.getByRole("spinbutton", { name: "Short break", exact: true })).toHaveValue(
    "2",
  );
  await expect(rhythm.getByRole("spinbutton", { name: "Long break", exact: true })).toHaveValue(
    "3",
  );
  await expect(
    rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }),
  ).toHaveValue("2");
  await rhythm.getByRole("button", { name: "All settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("spinbutton", { name: "Sessions before a long break" }),
  ).toHaveValue("2");
  await dialog.getByRole("checkbox", { name: /Open fullscreen automatically/ }).uncheck();
  await dialog.getByRole("button", { name: "Save my rhythm" }).click();
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(60_500);
  await expect(page.getByRole("tab", { name: "Short break" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".timer-digits")).toHaveText("02:00");
  await page.getByRole("button", { name: "Start break", exact: true }).click();
  await page.clock.fastForward(120_500);
  await expect(page.locator(".session-dots")).toHaveAttribute("aria-label", "Session 2 of 2");
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(60_500);
  await expect(page.getByRole("tab", { name: "Long break" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".timer-digits")).toHaveText("03:00");
});
test("dashboard duration changes preserve a running or paused session and apply on reset", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await page.clock.fastForward(10_000);
  const rhythm = page.getByRole("region", { name: "Your focus rhythm", exact: true });
  await rhythm.getByRole("spinbutton", { name: "Focus time", exact: true }).fill("10");
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("29:50");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await rhythm.getByRole("spinbutton", { name: "Focus time", exact: true }).fill("15");
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("29:50");
  await page.getByRole("button", { name: "Reset timer" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("15:00");
});
test("defaults, local tasks, completion statistics, and persistence", async ({ page }) => {
  await openPom(page);
  await expect(page.locator(".timer-digits")).toHaveText("30:00");
  await page.getByRole("textbox", { name: "New task" }).fill("Read a chapter");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText("Read a chapter", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete Read a chapter", exact: true }).click();
  await expect(
    page.locator(".stat").filter({ hasText: "Little wins" }).locator("strong"),
  ).toContainText("1");
  await page.reload();
  await expect(page.getByRole("button", { name: "Reopen Read a chapter" })).toBeVisible();
  await page.getByRole("button", { name: "Options for Read a chapter" }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("Read a chapter", { exact: true })).not.toBeVisible();
  await expect(
    page.locator(".stat").filter({ hasText: "Little wins" }).locator("strong"),
  ).toContainText("1");
});
test("custom durations finish accurately and appear in profile", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await settings(page);
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Focus time", exact: true })
    .fill("1");
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Short break", exact: true })
    .fill("2");
  await page.getByRole("button", { name: "Save my rhythm" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("01:00");
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(60_500);
  await expect(page.getByRole("tab", { name: "Short break" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".timer-digits")).toHaveText("02:00");
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await page.getByRole("button", { name: "My growth", exact: true }).click();
  await expect(
    page.locator(".insight-stats .stat").filter({ hasText: "Focus sessions" }).locator("strong"),
  ).toHaveText("1");
  await expect(page.locator(".session-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await expect(page.locator(".chart-key")).toContainText("1m");
});
test("pause excludes idle time, displays whole seconds, and skip records partial focus", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(10_500);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".timer-digits")).toHaveText(/^29:[45]\d$/);
  const paused = await page.locator(".timer-digits").textContent();
  await page.clock.fastForward(120_000);
  await expect(page.locator(".timer-digits")).toHaveText(paused!);
  await page.getByRole("button", { name: "Keep going" }).click();
  await page.clock.fastForward(10_000);
  await page.getByRole("button", { name: "Skip to next timer mode" }).click();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("pom.workspace.guest")!));
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0].seconds).toBeGreaterThanOrEqual(20);
  expect(data.sessions[0].seconds).toBeLessThan(23);
  expect(data.sessions[0].completed).toBe(false);
});
test("running timer survives refresh and focus mode has an escape", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await page.clock.fastForward(15_000);
  await page.reload();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(page.locator(".timer-digits")).toHaveText(/^29:4\d$/);
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
  await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
});
for (const state of ["idle", "paused"] as const) {
  test(`${state} fullscreen survives reload and an explicit exit is remembered`, async ({
    page,
  }) => {
    await openPom(page);
    if (state === "idle") {
      await settings(page);
      await page.getByRole("checkbox", { name: /Open fullscreen automatically/ }).uncheck();
      await page.getByRole("button", { name: "Save my rhythm" }).click();
      await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
    } else {
      await page.getByRole("button", { name: "Start focusing", exact: true }).click();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    const digits = await page.locator(".timer-digits").textContent();
    await page.reload();
    await expect(page.locator(".app-shell")).toHaveClass(/zen/);
    await expect(page.locator(".timer-digits")).toHaveText(digits!);
    await expect(
      page.getByRole("button", {
        name: state === "idle" ? "Start focusing" : "Keep going",
        exact: true,
      }),
    ).toBeEnabled();
    if (!(await page.evaluate(() => Boolean(document.fullscreenElement)))) {
      await page.getByRole("button", { name: "Enter browser fullscreen", exact: true }).click();
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    }
    await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
    await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: state === "idle" ? "Start focusing" : "Keep going",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
  });
}

test("automatic fullscreen shows the task transparently and the ring tracks remaining time", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await page.getByRole("textbox", { name: "New task" }).fill("Read a chapter");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.locator(".task-info").filter({ hasText: "Read a chapter" }).click();
  await settings(page);
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Focus time", exact: true })
    .fill("1");
  await page.getByRole("button", { name: "Save my rhythm" }).click();
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.locator(".zen-task")).toContainText("Read a chapter");
  await expect(page.locator(".zen-task")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const progress = page.getByRole("progressbar", { name: "Time remaining" });
  await expect(progress).toHaveAttribute("aria-valuenow", "60");
  await page.clock.fastForward(30_000);
  await expect(progress).toHaveAttribute("aria-valuenow", "30");
  await expect(page.locator(".timer-ring-remaining")).toHaveAttribute("stroke-dashoffset", "50");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.clock.fastForward(15_000);
  await expect(progress).toHaveAttribute("aria-valuenow", "30");
  await expect(page.locator(".timer-readout")).toHaveAttribute("data-animated", "false");
  await page.getByRole("button", { name: "Reset timer" }).click();
  await expect(progress).toHaveAttribute("aria-valuenow", "60");
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
});
test("progress bar, animation, and fullscreen preferences persist and the indicator can be hidden", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await openPom(page);
  await settings(page);
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Focus time", exact: true })
    .fill("1");
  await page.getByRole("checkbox", { name: /Open fullscreen automatically/ }).uncheck();
  await page.getByRole("checkbox", { name: /Animate the countdown/ }).uncheck();
  await page.getByRole("radio", { name: "Progress bar", exact: true }).check();
  await page.getByRole("button", { name: "Save my rhythm" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
  await expect(page.locator(".timer-progress-bar")).toBeVisible();
  await expect(page.locator(".timer-ring")).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  await expect(page.locator(".timer-progress-bar > span")).toHaveCSS(
    "transform",
    "matrix(0.5, 0, 0, 1, 0, 0)",
  );
  await expect(page.locator(".timer-progress-bar > span")).toHaveCSS("transition-duration", "0s");
  await settings(page);
  await expect(page.getByRole("radio", { name: "Progress bar", exact: true })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Open fullscreen automatically/ }),
  ).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Animate the countdown/ })).not.toBeChecked();
  await page.getByRole("radio", { name: "Off", exact: true }).check();
  await page.getByRole("button", { name: "Save my rhythm" }).click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator(".timer-digits")).toBeVisible();
});
test("blocked browser fullscreen keeps focus mode usable and its settings accessible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("Unavailable"));
  });
  await openPom(page);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.getByRole("button", { name: "Timer settings", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Ring", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await page.getByRole("button", { name: "Timer settings", exact: true }).click();
  await page.getByRole("radio", { name: "Progress bar", exact: true }).check();
  await page.getByRole("button", { name: "Save my rhythm" }).click();
  await expect(page.locator(".timer-progress-bar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/zen/);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});
test("mobile fullscreen fits long tasks and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPom(page);
  await page
    .getByRole("textbox", { name: "New task" })
    .fill("Read and take notes on a chapter about creating a calmer and more focused workspace");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.locator(".task-info").click();
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await expect(page.locator(".zen-task")).toBeVisible();
  await expect(page.locator(".timer-ring-remaining")).toHaveCSS("transition-duration", "0s");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator(".timer-card").boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Exit distraction-free mode" })).toBeInViewport();
  }
});
for (const source of ["cache", "guest workspace"] as const) {
  test(`saved theme from ${source} is applied before React loads`, async ({ page }) => {
    const workspace = emptyWorkspace();
    workspace.preferences.theme = "midnight";
    await page.addInitScript(
      ({ source, workspace }) => {
        if (source === "cache") localStorage.setItem("pom.theme", "midnight");
        else localStorage.setItem("pom.workspace.guest", JSON.stringify(workspace));
      },
      { source, workspace },
    );
    await page.route("**/_next/**", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(30, 35, 41)");
    await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeDisabled();
  });
}

test("themes and scenery persist and dialogs are keyboard dismissible", async ({ page }) => {
  await openPom(page);
  await page.getByRole("button", { name: "Make it yours" }).click();
  await page.getByRole("button", { name: /Rose A softer/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rose");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await page.getByRole("button", { name: /Ocean air Let your thoughts flow/ }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rose");
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
});
test("fourth completed focus session offers a long break", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await page.addInitScript(() => {
    localStorage.setItem(
      "pom.timer.guest",
      JSON.stringify({
        mode: "focus",
        remaining: 1,
        running: false,
        endsAt: null,
        id: crypto.randomUUID(),
        startedAt: new Date(Date.now() - 599000).toISOString(),
        elapsed: 599,
        round: 4,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Keep going" })).toBeEnabled();
  await page.getByRole("button", { name: "Keep going" }).click();
  await page.clock.fastForward(2000);
  await expect(page.getByRole("tab", { name: "Long break" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".timer-digits")).toHaveText("15:00");
});
test("mobile navigation, settings, and layouts fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPom(page);
  const rhythm = page.getByRole("region", { name: "Your focus rhythm", exact: true });
  await expect(rhythm).toBeVisible();
  await rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }).fill("12");
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(page.locator(".session-dots")).toHaveAttribute("aria-label", "Session 1 of 12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".mobile-nav").getByRole("button", { name: "Growth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your effort is growing roots." })).toBeVisible();
  await page.locator(".mobile-nav").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("spinbutton", { name: "Focus time", exact: true }),
  ).toHaveValue("30");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("private API routes require login and reject cross-origin writes", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/tasks", {
    data: { title: "Not authenticated" },
    headers: { origin: baseURL! },
  });
  expect(response.status()).toBe(401);
  const cross = await request.post("/api/tasks", {
    data: { title: "Not authenticated" },
    headers: { origin: "https://other.example" },
  });
  expect(cross.status()).toBe(403);
  const privateImage = await request.get("/api/backgrounds/00000000-0000-4000-8000-000000000000");
  expect(privateImage.status()).toBe(401);
  expect(privateImage.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/api/todoist/sync")).status()).toBe(401);
  expect(
    (
      await request.post("/api/todoist/sync", {
        headers: { origin: baseURL! },
        data: { taskIds: ["task"] },
      })
    ).status(),
  ).toBe(401);
});
test("signed-in UI imports Todoist and creates, applies, and saves an AI background", async ({
  page,
}) => {
  const task = {
    id: "todoist-1",
    title: "Review my notes",
    project: "Study",
    priority: 1,
    completed: false,
    source: "todoist",
    due: localDateKey(new Date()),
  };
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
  };
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        user: { id: "test-user", name: "Alex" },
        services: { auth: true, database: true, ai: true, todoist: true },
        todoistConnected: true,
      },
    }),
  );
  await page.route("**/api/workspace", (r) => r.fulfill({ json: workspace }));
  await page.route("**/api/todoist/sync", (r) => r.fulfill({ json: { tasks: [task], count: 1 } }));
  await page.route("**/api/settings", (r) =>
    r.fulfill({ json: { preferences: r.request().postDataJSON() } }),
  );
  await page.route("**/api/backgrounds", (r) =>
    r.fulfill({
      json: {
        background: {
          id: "test-scene",
          name: "A quiet lake",
          prompt: "A quiet lake",
          url: "/images/coast.jpg",
          createdAt: new Date().toISOString(),
        },
      },
    }),
  );
  await openPom(page);
  await page.getByRole("button", { name: "Sync Todoist", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Review my notes/ })).toBeChecked();
  await page.getByRole("button", { name: "Import 1 task", exact: true }).click();
  await expect(page.getByText("Review my notes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await page.getByRole("button", { name: "Create with AI", exact: true }).click();
  await page.getByRole("textbox", { name: "Where would you like to be?" }).fill("A quiet lake");
  await page.getByRole("button", { name: "Bring it to life" }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await expect(page.getByRole("button", { name: /^A quiet lake/ })).toBeVisible();
  await page.getByRole("button", { name: "Focus space", exact: true }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
});
