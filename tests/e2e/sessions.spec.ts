import { test, expect, type Page } from "@playwright/test";
import { emptyWorkspace, type FocusSession, type Workspace } from "../../lib/types";

test.use({ timezoneId: "Asia/Shanghai" });
const clockTime = new Date("2026-11-07T12:00:00Z");
const userId = "session-test-user";
const totalFocus = (page: Page) =>
  page.locator(".insight-stats .stat").filter({ hasText: "Total focus time" }).locator("strong");
const completedSessions = (page: Page) =>
  page.locator(".insight-stats .stat").filter({ hasText: "Focus sessions" }).locator("strong");
const growth = (page: Page) =>
  page.locator(".sidebar").getByRole("button", { name: "My growth", exact: true }).click();

async function signedIn(page: Page, workspace: Workspace) {
  workspace.preferences.autoFullscreen = false;
  workspace.preferences.sound = false;
  await page.clock.install({ time: clockTime });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: { id: userId, name: "Alex" },
        services: { auth: true, database: true, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
}

test("minute updates save cumulative progress without ending focus; pause and final save stay accurate", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.preferences.focus = 3;
  workspace.tasks = [
    {
      id: "read",
      title: "Read a chapter",
      project: "Personal",
      completed: false,
      source: "local",
      priority: 1,
    },
  ];
  const writes: FocusSession[] = [];
  let taskWrites = 0;
  await page.route("**/api/sessions", (route) => {
    const session: FocusSession = route.request().postDataJSON();
    writes.push(session);
    workspace.sessions = [
      ...workspace.sessions.filter((entry) => entry.id !== session.id),
      session,
    ];
    return route.fulfill({ json: { session } });
  });
  await page.route("**/api/tasks", (route) => {
    taskWrites++;
    const task = { ...workspace.tasks[0], completed: true, completedAt: clockTime.toISOString() };
    workspace.tasks = [task];
    workspace.completions = [
      { id: "completion", taskId: task.id, title: task.title, completedAt: task.completedAt },
    ];
    return route.fulfill({ json: { task } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(15_000);
  await page.getByRole("button", { name: "Complete Read a chapter", exact: true }).click();
  expect(taskWrites).toBe(1);
  expect(writes).toHaveLength(0);
  await page.clock.fastForward(44_000);
  expect(writes).toHaveLength(0);
  await page.clock.fastForward(1_000);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ seconds: 60, completed: false, status: "active" });
  await growth(page);
  await expect(totalFocus(page)).toHaveText("1m");
  await expect(completedSessions(page)).toHaveText("0");
  await expect(page.locator(".session-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Edit focus session", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator(".insight-stats .stat").filter({ hasText: "Tasks completed" }).locator("strong"),
  ).toHaveText("1");
  await page.clock.fastForward(60_000);
  await expect.poll(() => writes.length).toBe(2);
  await expect(totalFocus(page)).toHaveText("2m");
  expect(writes[1]).toMatchObject({ id: writes[0].id, seconds: 120 });
  await page.locator(".sidebar").getByRole("button", { name: "Focus space", exact: true }).click();
  await page.clock.fastForward(5_000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2].seconds).toBe(125);
  await page.clock.fastForward(120_000);
  expect(writes).toHaveLength(3);
  await page.getByRole("button", { name: "Keep going", exact: true }).click();
  await page.clock.fastForward(55_000);
  await expect.poll(() => writes.at(-1)?.status).toBe("finished");
  expect(writes.at(-1)).toMatchObject({ id: writes[0].id, seconds: 180, completed: true });
  expect(workspace.sessions).toHaveLength(1);
  await growth(page);
  await expect(totalFocus(page)).toHaveText("3m");
  await expect(completedSessions(page)).toHaveText("1");
  await page.reload();
  await growth(page);
  await expect(totalFocus(page)).toHaveText("3m");
  await expect(page.locator(".session-row")).toHaveCount(1);
});

test("every session is reachable; editing dates, duration and completion and deleting recalculate stats", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.sessions = Array.from({ length: 21 }, (_, index) => ({
    id: crypto.randomUUID(),
    startedAt: new Date(Date.parse("2026-11-07T08:00:00Z") + index * 180_000).toISOString(),
    endedAt: new Date(Date.parse("2026-11-07T08:02:00Z") + index * 180_000).toISOString(),
    seconds: 120,
    completed: true,
  }));
  await page.clock.install({ time: clockTime });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: null,
        services: { auth: false, database: false, ai: false, todoist: false },
        todoistConnected: false,
      },
    }),
  );
  await page.addInitScript((data) => {
    if (!localStorage.getItem("pom.workspace.guest"))
      localStorage.setItem("pom.workspace.guest", JSON.stringify(data));
  }, workspace);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
  await growth(page);
  await expect(totalFocus(page)).toHaveText("42m");
  await expect(page.locator(".session-row")).toHaveCount(10);
  await page.getByRole("button", { name: "Older sessions", exact: true }).click();
  await page.getByRole("button", { name: "Older sessions", exact: true }).click();
  await expect(page.locator(".session-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit focus session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Focused minutes", exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Session time must match");
  await dialog.getByRole("spinbutton", { name: "Focused minutes", exact: true }).fill("1");
  await dialog.getByLabel("Started at", { exact: true }).fill("2026-11-06T16:00:00");
  await dialog.getByLabel("Ended at", { exact: true }).fill("2026-11-06T16:02:00");
  await dialog.getByRole("checkbox", { name: "Completed full session" }).uncheck();
  await dialog.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(totalFocus(page)).toHaveText("41m");
  await expect(completedSessions(page)).toHaveText("20");
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(page.locator(".chart-key")).toContainText("40m");
  await expect(
    page.locator(".stat").filter({ hasText: "Current streak" }).locator("strong"),
  ).toHaveText("2 days");
  await page.reload();
  await growth(page);
  await expect(totalFocus(page)).toHaveText("41m");
  await page.getByRole("button", { name: "Older sessions", exact: true }).click();
  await page.getByRole("button", { name: "Older sessions", exact: true }).click();
  await page.getByRole("button", { name: "Delete focus session", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep session", exact: true }).click();
  await expect(page.locator(".session-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete focus session", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete session", exact: true }).click();
  await expect(totalFocus(page)).toHaveText("40m");
  await expect(page.locator(".session-row")).toHaveCount(10);
  await expect(page.locator(".session-pagination")).toContainText("11–20 of 20 sessions");
  await expect(
    page.locator(".stat").filter({ hasText: "Current streak" }).locator("strong"),
  ).toHaveText("1 day");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(
    page.locator(".session-row").first().getByRole("button", { name: "Edit focus session" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("signed-in edits and deletions persist on the server and update completed-session counts", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  workspace.tasks = [
    {
      id: "read",
      title: "Read a chapter",
      project: "Personal",
      completed: false,
      source: "local",
      priority: 1,
    },
  ];
  workspace.sessions = [
    {
      id: crypto.randomUUID(),
      startedAt: "2026-11-07T08:00:00.000Z",
      endedAt: "2026-11-07T08:20:00.000Z",
      seconds: 1200,
      completed: true,
    },
  ];
  const methods: string[] = [];
  await page.route("**/api/sessions", (route) => {
    const method = route.request().method();
    methods.push(method);
    if (method === "DELETE") {
      workspace.sessions = [];
      return route.fulfill({ json: { ok: true } });
    }
    const session: FocusSession = route.request().postDataJSON();
    workspace.sessions = [session];
    return route.fulfill({ json: { session } });
  });
  await signedIn(page, workspace);
  await growth(page);
  await page.getByRole("button", { name: "Edit focus session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Focused minutes", exact: true }).fill("10");
  await dialog.getByRole("combobox", { name: "Task", exact: true }).selectOption("read");
  await dialog.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(methods).toEqual(["PATCH"]);
  expect(workspace.sessions[0]).toMatchObject({ seconds: 600, taskId: "read", completed: true });
  await expect(totalFocus(page)).toHaveText("10m");
  await page.reload();
  await growth(page);
  await expect(page.locator(".session-row")).toContainText("Read a chapter");
  await page.getByRole("button", { name: "Delete focus session", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete session", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(methods).toEqual(["PATCH", "DELETE"]);
  await expect(totalFocus(page)).toHaveText("0m");
  await expect(completedSessions(page)).toHaveText("0");
  await page.reload();
  await growth(page);
  await expect(page.locator(".session-row")).toHaveCount(0);
});

test("offline corrections and deletions survive reload and retry the latest change on reconnect", async ({
  page,
}) => {
  const workspace = emptyWorkspace();
  let offline = true;
  const methods: string[] = [];
  await page.route("**/api/sessions", (route) => {
    methods.push(route.request().method());
    if (offline) return route.fulfill({ status: 503, json: { error: "Offline" } });
    return route.fulfill({ json: { ok: true } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(65_000);
  await page.getByRole("button", { name: "Reset timer", exact: true }).click();
  await growth(page);
  await page.getByRole("button", { name: "Edit focus session", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Focused minutes", exact: true })
    .fill("0");
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Focused seconds", exact: true })
    .fill("30");
  await page.getByRole("dialog").getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".session-duration")).toHaveText("30s");
  const attempts = methods.length;
  await page.clock.fastForward(60_000);
  await expect.poll(() => methods.length).toBeGreaterThan(attempts);
  expect(methods.at(-1)).toBe("PATCH");
  await page.reload();
  await growth(page);
  await expect(page.locator(".session-duration")).toHaveText("30s");
  await page.getByRole("button", { name: "Delete focus session", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(page.locator(".session-row")).toHaveCount(0);
  await page.reload();
  await growth(page);
  await expect(page.locator(".session-row")).toHaveCount(0);
  expect(
    await page.evaluate((id) => JSON.parse(localStorage.getItem(`pom.pending.${id}`)!), userId),
  ).toMatchObject([{ method: "DELETE" }]);
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() =>
      page.evaluate((id) => JSON.parse(localStorage.getItem(`pom.pending.${id}`)!).length, userId),
    )
    .toBe(0);
  expect(methods.at(-1)).toBe("DELETE");
});

test("a slow heartbeat cannot clear a newer final save from the sync queue", async ({ page }) => {
  const workspace = emptyWorkspace();
  const writes: FocusSession[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions", async (route) => {
    const session: FocusSession = route.request().postDataJSON();
    writes.push(session);
    if (writes.length === 1) await waiting;
    workspace.sessions = [session];
    return route.fulfill({ json: { session } });
  });
  await signedIn(page, workspace);
  await page.getByRole("button", { name: "Start focusing", exact: true }).click();
  await page.clock.fastForward(60_000);
  await expect.poll(() => writes.length).toBe(1);
  await page.clock.fastForward(15_000);
  await page.getByRole("button", { name: "Reset timer", exact: true }).click();
  release();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    id: writes[0].id,
    seconds: 75,
    status: "finished",
    completed: false,
  });
  await growth(page);
  await expect(page.locator(".session-row")).toHaveCount(1);
  await expect(page.locator(".session-state")).toHaveText("A little progress");
  await expect
    .poll(() =>
      page.evaluate((id) => JSON.parse(localStorage.getItem(`pom.pending.${id}`)!).length, userId),
    )
    .toBe(0);
});

test("all session mutations require sign-in and reject foreign origins", async ({
  request,
  baseURL,
}) => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const response = await request.fetch("/api/sessions", {
      method,
      headers: { origin: baseURL! },
      data: { id: crypto.randomUUID() },
    });
    expect(response.status()).toBe(401);
    const foreign = await request.fetch("/api/sessions", {
      method,
      headers: { origin: "https://other.example" },
      data: { id: crypto.randomUUID() },
    });
    expect(foreign.status()).toBe(403);
  }
});
