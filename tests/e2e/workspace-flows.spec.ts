import { test, expect, type Page } from "@playwright/test";
import { emptyWorkspace, type Background, type Task, type Workspace } from "../../lib/types";

test.use({ timezoneId: "Asia/Shanghai" });

async function signedIn(page: Page, workspace: Workspace) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", name: "Alex" },
        services: { auth: true, database: true, ai: true, todoist: true },
        todoistConnected: true,
      },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
  await page.route("**/api/settings", (route) => {
    workspace.preferences = route.request().postDataJSON();
    return route.fulfill({ json: { preferences: workspace.preferences } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}

const task = (id: string, title: string, project: string, due?: string): Task => ({
  id,
  title,
  project,
  due,
  source: "todoist",
  completed: false,
  priority: 1,
});

test("fullscreen task completion waits for Todoist, supports retry, and persists without stopping focus", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  const imported = task("report", "Finish the report", "Work");
  const local = { ...task("notes", "Review notes", "Personal"), source: "local" as const };
  workspace.tasks = [
    imported,
    local,
    { ...task("done", "Already finished", "Work"), completed: true },
  ];
  let attempts = 0;
  let releaseFailure!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route("**/api/tasks", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ id: imported.id, completed: true });
    attempts++;
    if (attempts === 1) {
      await waiting;
      return route.fulfill({
        status: 502,
        json: { error: "Todoist couldn’t update this task. Reconnect or try again." },
      });
    }
    const completed = { ...imported, completed: true, completedAt: new Date().toISOString() };
    workspace.tasks = workspace.tasks.map((entry) =>
      entry.id === completed.id ? completed : entry,
    );
    return route.fulfill({ json: { task: completed } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  const list = page.getByRole("region", { name: "Tasks to complete" });
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByText("Already finished")).toHaveCount(0);
  await list.getByRole("button", { name: "Focus on Review notes", exact: true }).click();
  await expect(page.locator(".zen-task")).toContainText("Review notes");
  await expect(
    list.getByRole("button", { name: "Focus on Review notes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await list.getByRole("button", { name: "Focus on Finish the report", exact: true }).click();
  const complete = list.getByRole("button", { name: "Complete Finish the report", exact: true });
  await complete.click();
  await expect(complete).toBeDisabled();
  await expect(list.locator(".spin")).toBeVisible();
  await expect(
    list.getByRole("button", { name: "Complete Review notes", exact: true }),
  ).toBeDisabled();
  await expect(list.getByText("Finish the report", { exact: true })).toBeVisible();
  releaseFailure();
  await expect(page.locator(".toast")).toContainText("Todoist couldn’t update this task");
  await expect(complete).toBeEnabled();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await complete.click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByText("1 remaining")).toBeVisible();
  await expect(page.locator(".zen-task")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toHaveClass(/zen/);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.reload();
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen Finish the report", exact: true }),
  ).toBeVisible();
});

test("fullscreen lists scroll on mobile and landscape while timer controls stay visible", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.tasks = Array.from({ length: 16 }, (_, index) =>
    task(
      `task-${index}`,
      `Task ${String(index + 1).padStart(2, "0")}: Read and take notes about creating a calmer and more focused workspace`,
      "Personal",
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  const list = page.getByRole("region", { name: "Tasks to complete" });
  await list
    .getByRole("button", { name: `Focus on ${workspace.tasks[0].title}`, exact: true })
    .click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Exit distraction-free mode" })).toBeInViewport();
    const bounds = await page.locator(".timer-card").boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await list.locator("ul").evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    const last = list.getByRole("button", {
      name: `Complete ${workspace.tasks.at(-1)!.title}`,
      exact: true,
    });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeInViewport();
    expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test("guest fullscreen tasks complete locally and show an empty state", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: null,
        services: { auth: false, database: false, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
  await page.getByRole("textbox", { name: "New task" }).fill("Read a chapter");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  const list = page.getByRole("region", { name: "Tasks to complete" });
  await list.getByRole("button", { name: "Complete Read a chapter", exact: true }).click();
  await expect(list.getByRole("status")).toHaveText(
    "All tasks complete. A little room to breathe.",
  );
  await expect(list.getByText("0 remaining")).toBeVisible();
  await page.reload();
  await expect(list.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen Read a chapter", exact: true }),
  ).toBeVisible();
});

test("signed-in dashboard settings retain edits after a failed save and sync on retry", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.preferences.theme = "rose";
  workspace.preferences.dailyGoal = 180;
  await signedIn(page, workspace);
  let failSave = true;
  await page.route("**/api/settings", (route) => {
    if (failSave)
      return route.fulfill({ status: 503, json: { error: "Couldn’t sync. Try again." } });
    workspace.preferences = route.request().postDataJSON();
    return route.fulfill({ json: { preferences: workspace.preferences } });
  });
  const rhythm = page.getByRole("region", { name: "Your focus rhythm", exact: true });
  await rhythm.getByRole("spinbutton", { name: "Focus time", exact: true }).fill("45");
  await rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }).fill("3");
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(rhythm.getByRole("alert")).toHaveText("Couldn’t sync. Try again.");
  await expect(page.locator(".timer-digits")).toHaveText("30:00");
  await expect(rhythm.getByRole("spinbutton", { name: "Focus time", exact: true })).toHaveValue(
    "45",
  );
  failSave = false;
  await rhythm.getByRole("button", { name: "Save timer settings" }).click();
  await expect(page.locator(".timer-digits")).toHaveText("45:00");
  expect(workspace.preferences.sessionsBeforeLongBreak).toBe(3);
  expect(workspace.preferences.theme).toBe("rose");
  expect(workspace.preferences.dailyGoal).toBe(180);
  await page.reload();
  await expect(
    rhythm.getByRole("spinbutton", { name: "Sessions before a long break" }),
  ).toHaveValue("3");
  await page.getByRole("button", { name: "Timer settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton", { name: "Focus time", exact: true })).toHaveValue(
    "45",
  );
  await dialog.getByRole("spinbutton", { name: "Focus time", exact: true }).fill("25");
  await dialog.getByRole("button", { name: "Save my rhythm" }).click();
  await expect(rhythm.getByRole("spinbutton", { name: "Focus time", exact: true })).toHaveValue(
    "25",
  );
});

test("Todoist previews before writing, selects only the local day's tasks, and imports the chosen subset", async ({
  page,
}) => {
  // November 7 locally, while it is still November 6 in UTC.
  await page.clock.install({ time: new Date("2026-11-06T16:30:00Z") });
  const candidates = [
    task("study", "Review notes", "Study", "2026-11-07"),
    task("work", "Write brief", "Work", "2026-11-07"),
    task("late", "Overdue report", "Work", "2026-11-06"),
    task("future", "Book a trip", "Personal", "2026-11-08"),
    task("undated", "Someday idea", "Inbox"),
  ];
  const workspace = emptyWorkspace();
  workspace.tasks = [{ ...task("local", "Keep local task", "Personal"), source: "local" }];
  let imports = 0;
  await page.route("**/api/todoist/sync", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { tasks: candidates } });
    imports++;
    const { taskIds } = route.request().postDataJSON();
    expect(taskIds).toEqual(["study", "future"]);
    workspace.tasks.push(...candidates.filter((t) => taskIds.includes(t.id)));
    return route.fulfill({ json: { tasks: workspace.tasks, count: taskIds.length } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Sync Todoist", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: /Review notes/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Write brief/ })).toBeChecked();
  for (const name of [/Overdue report/, /Book a trip/, /Someday idea/])
    await expect(dialog.getByRole("checkbox", { name })).not.toBeChecked();
  expect(imports).toBe(0);
  const today = dialog.getByRole("region", { name: "Due today", exact: true });
  await expect(today.getByRole("heading", { name: "Study", exact: true })).toBeVisible();
  await expect(today.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Write brief/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /Book a trip/ }).check();
  await dialog.getByRole("button", { name: "Import 2 tasks", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(imports).toBe(1);
  await page.getByRole("button", { name: /^My tasks/ }).click();
  await expect(
    page
      .getByRole("region", { name: "Due today", exact: true })
      .getByText("Review notes", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Upcoming", exact: true })
      .getByText("Book a trip", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Keep local task", { exact: true })).toBeVisible();
  await expect(page.getByText("Write brief", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Due today", exact: true }).click();
  await expect(page.getByText("Book a trip", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Sync Todoist", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: /Review notes/ })).toBeChecked();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(imports).toBe(1);
});

test("Todoist supports loading and import retries, and selects nothing when no task is due today", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-06T16:30:00Z") });
  const workspace = emptyWorkspace();
  const candidate = task("later", "Plan next week", "Work", "2026-11-09");
  let previewUnavailable = true;
  let imports = 0;
  await page.route("**/api/todoist/sync", (route) => {
    if (route.request().method() === "GET") {
      return previewUnavailable
        ? route.fulfill({ status: 502, json: { error: "Todoist is unavailable." } })
        : route.fulfill({ json: { tasks: [candidate] } });
    }
    imports++;
    expect(route.request().postDataJSON()).toEqual({ taskIds: ["later"] });
    return imports === 1
      ? route.fulfill({ status: 502, json: { error: "Couldn’t import. Try again." } })
      : route.fulfill({ json: { tasks: [candidate], count: 1 } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Sync Todoist", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveText("Todoist is unavailable.");
  previewUnavailable = false;
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Import 0 tasks", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Import 1 task", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn’t import. Try again.");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Import 1 task", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(imports).toBe(2);
});

test("AI revisions stay in one scene, preserve every version, and persist the chosen image and prompt", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.backgrounds = [
    {
      id: "original",
      name: "A quiet lake",
      prompt: "A quiet lake at sunrise",
      source: "ai",
      url: "/images/coast.jpg",
      createdAt: new Date().toISOString(),
    },
  ];
  const original = { ...workspace.backgrounds[0] };
  const revisedPrompt = "A quiet lake at sunset with golden clouds";
  const nextPrompt = "A quiet lake surrounded by a green forest";
  let attempts = 0;
  let selections = 0;
  await page.route("**/api/backgrounds", (route) => {
    if (route.request().method() === "PATCH") {
      const { id, versionId } = route.request().postDataJSON();
      expect(id).toBe(original.id);
      selections++;
      if (selections === 1)
        return route.fulfill({
          status: 502,
          json: { error: "Couldn’t save this version. Try again." },
        });
      const current = workspace.backgrounds[0];
      const version = current.versions!.find((v) => v.id === versionId)!;
      expect(version).toBeTruthy();
      workspace.backgrounds[0] = {
        ...current,
        prompt: version.prompt,
        url: version.url,
        selectedVersionId: versionId,
      };
      return route.fulfill({ json: { background: workspace.backgrounds[0] } });
    }
    if (route.request().method() === "DELETE") {
      expect(route.request().postDataJSON()).toEqual({ id: original.id });
      workspace.backgrounds = [];
      return route.fulfill({ json: { ok: true } });
    }
    expect(route.request().method()).toBe("POST");
    attempts++;
    expect(route.request().postDataJSON()).toEqual({
      prompt: attempts <= 2 ? revisedPrompt : nextPrompt,
      backgroundId: original.id,
    });
    if (attempts === 1)
      return route.fulfill({ status: 502, json: { error: "Generation failed. Try again." } });
    const version = {
      id: attempts === 2 ? "revised" : "third",
      prompt: attempts === 2 ? revisedPrompt : nextPrompt,
      url: attempts === 2 ? "/images/dunes.jpg" : "/images/forest.jpg",
      createdAt: new Date().toISOString(),
    };
    const current = workspace.backgrounds[0];
    const background: Background = {
      ...current,
      prompt: version.prompt,
      url: version.url,
      selectedVersionId: version.id,
      versions: [
        ...(current.versions || [
          {
            id: original.id,
            prompt: original.prompt,
            url: original.url,
            createdAt: original.createdAt,
          },
        ]),
        version,
      ],
    };
    workspace.backgrounds = [background];
    return route.fulfill({ json: { background } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await page.getByRole("button", { name: "Edit prompt for A quiet lake", exact: true }).click();
  const prompt = page.getByRole("textbox", { name: "Where would you like to be?" });
  await expect(prompt).toHaveValue("A quiet lake at sunrise");
  await expect(page.locator(".generation-scenery")).toHaveCSS("background-image", /coast.jpg/);
  await prompt.fill(revisedPrompt);
  await page.getByRole("button", { name: "Create revised scene", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Generation failed. Try again.");
  await expect(prompt).toHaveValue(revisedPrompt);
  expect(workspace.backgrounds).toHaveLength(1);
  await page.getByRole("button", { name: "Create revised scene", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /dunes.jpg/);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /dunes.jpg/);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await expect(page.locator(".saved-scene")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Choose version for A quiet lake", exact: true }),
  ).toHaveText("2 versions · Version 2 selected");
  await page.getByRole("button", { name: "Edit prompt for A quiet lake", exact: true }).click();
  await expect(prompt).toHaveValue(revisedPrompt);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Choose version for A quiet lake", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use version 2 for A quiet lake", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const firstVersion = page.getByRole("button", {
    name: "Use version 1 for A quiet lake",
    exact: true,
  });
  await firstVersion.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Couldn’t save this version. Try again.",
  );
  await expect(
    page.getByRole("button", { name: "Use version 2 for A quiet lake", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await firstVersion.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /coast.jpg/);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await page.getByRole("button", { name: "Edit prompt for A quiet lake", exact: true }).click();
  await expect(prompt).toHaveValue("A quiet lake at sunrise");
  await prompt.fill(nextPrompt);
  await page.getByRole("button", { name: "Create revised scene", exact: true }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /forest.jpg/);
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await expect(page.locator(".saved-scene")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Choose version for A quiet lake", exact: true }),
  ).toHaveText("3 versions · Version 3 selected");
  await page.getByRole("button", { name: "Choose version for A quiet lake", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".version-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Use version 2 for A quiet lake", exact: true }).click();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /dunes.jpg/);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /dunes.jpg/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
  await page.getByRole("button", { name: "Create with AI", exact: true }).click();
  await expect(prompt).toHaveValue("");
  await expect(page.getByRole("button", { name: "Bring it to life", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Delete A quiet lake", exact: true }).click();
  await expect(page.locator(".saved-scene")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".timer-card")).toHaveCSS("background-image", /forest.jpg/);
  expect(attempts).toBe(3);
  expect(selections).toBe(3);
});
