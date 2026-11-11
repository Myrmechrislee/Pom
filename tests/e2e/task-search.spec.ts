import { test, expect, type Locator, type Page } from "@playwright/test";
import { emptyWorkspace, type Task } from "../../lib/types";

test.use({ timezoneId: "Asia/Shanghai" });

const tasks: Task[] = [
  { id: "read", title: "Read a chapter", project: "Reading" },
  { id: "notes", title: "Write notes", project: "Work" },
  { id: "room", title: "Book a room", project: "" },
  { id: "budget", title: "Review budget", project: "Work" },
  { id: "launch", title: "Plan launch", project: "Launch", due: "2026-11-07" },
  { id: "follow-up", title: "Plan follow-up", project: "Work", source: "todoist" },
  { id: "archive", title: "Plan archive", project: "Work", completed: true },
].map(
  (task, order) => ({ completed: false, source: "local", priority: 1, ...task, order }) as Task,
);

const titles = (list: Locator) =>
  list.locator("[data-task-id] .task-info > span, [data-task-id] .zen-task-info > span");

async function openGuest(page: Page) {
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
    localStorage.setItem("pom.workspace.guest", JSON.stringify(value));
  }, workspace);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}

test("dashboard search finds tasks beyond the preview by title or project and clears cleanly", async ({
  page,
}) => {
  await openGuest(page);
  const list = page.locator(".tasks-card");
  const search = list.getByRole("searchbox", { name: "Search tasks" });
  await expect(titles(list)).toHaveText(tasks.slice(0, 4).map((task) => task.title));
  await search.fill("  pLaN LAUNCH  ");
  await expect(titles(list)).toHaveText(["Plan launch"]);
  await search.fill("WORK");
  await expect(titles(list)).toHaveText([
    "Write notes",
    "Review budget",
    "Plan follow-up",
    "Plan archive",
  ]);
  await search.fill("personal");
  await expect(titles(list)).toHaveText(["Book a room"]);
  await search.fill("does not exist");
  await expect(titles(list)).toHaveCount(0);
  await expect(list.getByRole("heading", { name: "No matching tasks." })).toBeVisible();
  await list.getByRole("button", { name: "Clear task search" }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(titles(list)).toHaveText(tasks.slice(0, 4).map((task) => task.title));
  await search.fill("   ");
  await expect(titles(list)).toHaveText(tasks.slice(0, 4).map((task) => task.title));
});

test("search stays in sync across dashboard, fullscreen, and the tasks page while completion still works", async ({
  page,
}) => {
  await openGuest(page);
  await page.locator(".tasks-card").getByRole("searchbox").fill("plan");
  await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
  const list = page.getByRole("region", { name: "Tasks to complete" });
  const search = list.getByRole("searchbox", { name: "Search tasks" });
  await expect(search).toHaveValue("plan");
  await expect(titles(list)).toHaveText(["Plan launch", "Plan follow-up"]);
  await expect(list.getByText("2 of 6 remaining", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Focus on Plan launch", exact: true }).click();
  await search.fill("missing");
  await expect(titles(list)).toHaveCount(0);
  await expect(list.getByRole("status")).toContainText("No matching tasks.");
  await expect(page.locator(".zen-task")).toContainText("Plan launch");
  await list.getByRole("button", { name: "Clear task search" }).click();
  await expect(titles(list)).toHaveCount(6);
  await search.fill("Plan launch");
  await list.getByRole("button", { name: "Complete Plan launch", exact: true }).click();
  await expect(titles(list)).toHaveCount(0);
  await expect(list.getByText("0 of 5 remaining", { exact: true })).toBeVisible();
  await expect(list.getByRole("status")).toContainText("No matching tasks.");
  await page.getByRole("button", { name: "Exit distraction-free mode" }).click();
  await expect(page.locator(".tasks-card").getByRole("searchbox")).toHaveValue("Plan launch");
  await expect(page.getByRole("button", { name: "Reopen Plan launch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^My tasks/ }).click();
  const full = page.locator(".full-tasks");
  await expect(full.getByRole("searchbox")).toHaveValue("Plan launch");
  await full.getByRole("button", { name: "Done", exact: true }).click();
  await expect(titles(full)).toHaveText(["Plan launch"]);
  await full.getByRole("searchbox").fill("work");
  await expect(titles(full)).toHaveText(["Plan archive"]);
});

test("search composes with project and status filters, sorting, and reordering without moving hidden tasks", async ({
  page,
}) => {
  await openGuest(page);
  const list = page.locator(".tasks-card");
  await list.getByRole("searchbox").fill("plan");
  await list.getByRole("combobox", { name: "Filter tasks", exact: true }).selectOption("active");
  await list.getByRole("combobox", { name: "Filter by project" }).selectOption("Work");
  await expect(titles(list)).toHaveText(["Plan follow-up"]);
  await list.getByRole("combobox", { name: "Filter by project" }).selectOption("");
  await list.getByRole("combobox", { name: "Sort tasks" }).selectOption("title");
  await expect(titles(list)).toHaveText(["Plan follow-up", "Plan launch"]);
  await list.getByRole("button", { name: "Reorder Plan launch", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(list.getByRole("combobox", { name: "Sort tasks" })).toHaveValue("manual");
  await expect(titles(list)).toHaveText(["Plan launch", "Plan follow-up"]);
  await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
  const fullscreen = page.getByRole("region", { name: "Tasks to complete" });
  await fullscreen.getByRole("button", { name: "Reorder Plan follow-up", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(titles(fullscreen)).toHaveText(["Plan follow-up", "Plan launch"]);
  await fullscreen.getByRole("button", { name: "Clear task search" }).click();
  await expect(titles(fullscreen)).toHaveText([
    "Read a chapter",
    "Write notes",
    "Book a room",
    "Review budget",
    "Plan follow-up",
    "Plan launch",
  ]);
  const saved = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem("pom.workspace.guest")!).tasks as Task[])
      .sort((a, b) => a.order! - b.order!)
      .map((task) => task.id),
  );
  expect(saved).toEqual(["read", "notes", "room", "budget", "follow-up", "launch", "archive"]);
});

test.describe("mobile search", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("dashboard and fullscreen search controls fit on a narrow screen", async ({ page }) => {
    await openGuest(page);
    const dashboard = page.locator(".tasks-card");
    await dashboard.getByRole("searchbox").fill("launch");
    await expect(titles(dashboard)).toHaveText(["Plan launch"]);
    await page.getByRole("button", { name: "Enter distraction-free mode" }).click();
    const list = page.getByRole("region", { name: "Tasks to complete" });
    await expect(list.getByRole("searchbox")).toBeInViewport();
    await expect(list.getByRole("button", { name: "Clear task search" })).toBeInViewport();
    await list.getByRole("button", { name: "Clear task search" }).click();
    await list.getByRole("searchbox").fill("reading");
    await expect(titles(list)).toHaveText(["Read a chapter"]);
    expect(
      await page.locator(".zen").evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  });
});
