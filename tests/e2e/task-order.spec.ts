import { test, expect, type Locator, type Page } from "@playwright/test";
import { emptyWorkspace, type Task, type Workspace } from "../../lib/types";
import { sortTasks } from "../../lib/tasks";

test.use({ timezoneId: "Asia/Shanghai" });

const today = "2026-11-07";
const task = (id: string, project = "Work", due?: string, completed = false): Task => ({
  id,
  title: id,
  project,
  due,
  completed,
  source: "local",
  priority: 1,
});
const titles = (list: Locator) =>
  list.locator("[data-task-id] .task-info > span, [data-task-id] .zen-task-info > span");

async function openGuest(page: Page, tasks: Task[]) {
  const workspace = emptyWorkspace();
  workspace.tasks = tasks;
  workspace.preferences.sound = false;
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: null,
        services: { auth: false, database: false, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
  await page.addInitScript((value) => {
    if (!localStorage.getItem("pom.workspace.guest"))
      localStorage.setItem("pom.workspace.guest", JSON.stringify(value));
  }, workspace);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}

async function openSignedIn(page: Page, workspace: Workspace) {
  workspace.preferences.sound = false;
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "task-order-user", name: "Alex" },
        services: { auth: true, database: true, ai: false, todoist: true },
        todoistConnected: true,
      },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}

async function dragBefore(page: Page, list: Locator, source: string, target: string) {
  const handle = list.getByRole("button", { name: `Reorder ${source}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  const destination = (await list
    .locator("[data-task-id]")
    .filter({ has: page.getByRole("button", { name: `Reorder ${target}`, exact: true }) })
    .boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 4, { steps: 8 });
  await expect(list.locator('[data-drop="before"]')).toHaveAttribute("data-task-id", target);
  await page.mouse.up();
}

test("dashboard and fullscreen share drag order across projects and due dates, persist on reload, and preserve focus", async ({
  page,
}) => {
  await openGuest(page, [
    task("Alpha", "Work", "2026-11-06"),
    task("Bravo", "Study", today),
    task("Charlie", "Personal"),
    task("Done", "Work", undefined, true),
    task("Extra"),
  ]);
  const dashboard = page.locator(".tasks-card");
  await dragBefore(page, dashboard, "Charlie", "Alpha");
  await expect(titles(dashboard)).toHaveText(["Charlie", "Alpha", "Bravo", "Extra"]);
  await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
  const fullscreen = page.getByRole("region", { name: "Tasks to complete" });
  await expect(titles(fullscreen)).toHaveText(["Charlie", "Alpha", "Bravo", "Extra"]);
  await fullscreen.getByRole("button", { name: "Focus on Bravo", exact: true }).click();
  await dragBefore(page, fullscreen, "Bravo", "Charlie");
  await expect(titles(fullscreen)).toHaveText(["Bravo", "Charlie", "Alpha", "Extra"]);
  await expect(page.locator(".zen-task")).toContainText("Bravo");
  await fullscreen.getByRole("button", { name: "Complete Charlie", exact: true }).click();
  await expect(titles(fullscreen)).toHaveText(["Bravo", "Alpha", "Extra"]);
  await page.reload();
  await expect(titles(fullscreen)).toHaveText(["Bravo", "Alpha", "Extra"]);
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await page.getByRole("button", { name: /^My tasks/ }).click();
  await expect(titles(page.locator(".full-tasks"))).toHaveText([
    "Bravo",
    "Charlie",
    "Alpha",
    "Extra",
    "Done",
  ]);
});

test("dashboard filters and sorts compose; a filtered drag switches to manual without moving hidden tasks", async ({
  page,
}) => {
  await openGuest(page, [
    { ...task("Zulu", "Work", "2026-11-08"), order: 0, priority: 4 },
    { ...task("Hidden", "Personal", today), order: 1 },
    { ...task("Alpha", "Work", today), order: 2 },
    { ...task("Done", "Work", undefined, true), order: 3 },
    { ...task("Offscreen", "Work"), order: 4 },
  ]);
  const list = page.locator(".tasks-card");
  await page.getByRole("combobox", { name: "Filter tasks", exact: true }).selectOption("today");
  await expect(titles(list)).toHaveText(["Hidden", "Alpha"]);
  await page.getByRole("combobox", { name: "Filter tasks", exact: true }).selectOption("active");
  await page.getByRole("combobox", { name: "Filter by project" }).selectOption("Work");
  await page.getByRole("combobox", { name: "Sort tasks" }).selectOption("title");
  await expect(titles(list)).toHaveText(["Alpha", "Offscreen", "Zulu"]);
  await dragBefore(page, list, "Zulu", "Alpha");
  await expect(page.getByRole("combobox", { name: "Sort tasks" })).toHaveValue("manual");
  await expect(titles(list)).toHaveText(["Zulu", "Alpha", "Offscreen"]);
  await page.getByRole("combobox", { name: "Filter by project" }).selectOption("");
  await page.getByRole("combobox", { name: "Filter tasks", exact: true }).selectOption("all");
  await page.getByRole("button", { name: /^My tasks/ }).click();
  const full = page.locator(".full-tasks");
  await expect(titles(full)).toHaveText(["Zulu", "Hidden", "Alpha", "Done", "Offscreen"]);
  await page.getByRole("combobox", { name: "Sort tasks" }).selectOption("priority");
  await expect(titles(full).first()).toHaveText("Zulu");
  await page.getByRole("combobox", { name: "Sort tasks" }).selectOption("due");
  await expect(titles(full)).toHaveText(["Hidden", "Alpha", "Zulu", "Offscreen", "Done"]);
  await page.getByRole("combobox", { name: "Sort tasks" }).selectOption("manual");
  await expect(titles(full)).toHaveText(["Zulu", "Hidden", "Alpha", "Done", "Offscreen"]);
});

test("signed-in reordering saves imported and local tasks, rolls back failed saves, and supports repeated keyboard moves", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.tasks = [
    task("Alpha"),
    { ...task("Bravo", "Study"), source: "todoist" },
    task("Charlie"),
  ];
  let attempts = 0;
  await page.route("**/api/tasks", (route) => {
    expect(route.request().method()).toBe("PUT");
    const { taskIds } = route.request().postDataJSON() as { taskIds: string[] };
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Couldn’t save task order. Try again." },
      });
    workspace.tasks = taskIds.map((id, order) => ({
      ...workspace.tasks.find((entry) => entry.id === id)!,
      order,
    }));
    return route.fulfill({ json: { ok: true } });
  });
  await openSignedIn(page, workspace);
  const list = page.locator(".tasks-card");
  const original = await titles(list).allTextContents();
  await dragBefore(page, list, original[2], original[0]);
  await expect(page.locator(".toast")).toContainText("Couldn’t save task order");
  await expect(titles(list)).toHaveText(original);
  const handle = list.getByRole("button", { name: `Reorder ${original[2]}`, exact: true });
  await handle.focus();
  await page.keyboard.press("ArrowUp");
  await expect(titles(list)).toHaveText([original[0], original[2], original[1]]);
  await expect(handle).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(titles(list)).toHaveText([original[2], original[0], original[1]]);
  await expect(handle).toBeFocused();
  await expect.poll(() => attempts).toBe(3);
  await page.reload();
  await expect(titles(list)).toHaveText([original[2], original[0], original[1]]);
  await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
  await expect(titles(page.locator(".zen-tasks"))).toHaveText([
    original[2],
    original[0],
    original[1],
  ]);
});

test.describe("touch reordering", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("touch dragging reorders the fullscreen list without activating a task", async ({
    page,
  }) => {
    await openGuest(page, [task("Alpha"), task("Bravo"), task("Charlie")]);
    await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
    const list = page.locator(".zen-tasks");
    const source = (await list
      .getByRole("button", { name: "Reorder Charlie", exact: true })
      .boundingBox())!;
    const target = (await list.locator('[data-task-id="Alpha"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = source.x + source.width / 2;
    const y = source.y + source.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 10 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: target.y + 4 }],
    });
    await expect(list.locator('[data-drop="before"]')).toHaveAttribute("data-task-id", "Alpha");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(titles(list)).toHaveText(["Charlie", "Alpha", "Bravo"]);
    await expect(page.locator(".zen-task")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Exit distraction-free mode" })).toBeInViewport();
  });
});
