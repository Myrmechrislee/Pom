import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasks, isDueToday, reorderTasks, sortTasks } from "../lib/tasks";
import { taskOrderSchema, todoistPageSchema, todoistSyncSchema } from "../lib/validation";
import { planTodoistImport } from "../lib/todoist-import";
import type { Task } from "../lib/types";

const task = (id: string, due?: string, project = "Work", completed = false): Task => ({
  id,
  title: id,
  due,
  project,
  completed,
  source: "todoist",
  priority: 1,
});

test("today selection uses the calendar date and excludes overdue, future, undated, and completed tasks", () => {
  const tasks = [
    task("today", "2026-11-07"),
    task("timed", "2026-11-07T23:30:00"),
    task("late", "2026-11-06"),
    task("future", "2026-11-08"),
    task("undated"),
    task("done", "2026-11-07", "Work", true),
  ];
  assert.deepEqual(
    tasks.filter((t) => isDueToday(t, "2026-11-07")).map((t) => t.id),
    ["today", "timed"],
  );
});

test("tasks are grouped with overdue first, then by category, with no lost or duplicate tasks", () => {
  const tasks = [
    task("later", "2026-11-08"),
    task("late", "2026-11-06"),
    task("today-work", "2026-11-07"),
    task("today-study", "2026-11-07", "Study"),
    task("undated"),
    task("done", "2026-11-07", "Work", true),
  ];
  const groups = groupTasks(tasks, "2026-11-07");
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Overdue", "Due today", "Upcoming", "No due date", "Completed"],
  );
  assert.deepEqual(
    groups[1].categories.map((c) => c.name),
    ["Study", "Work"],
  );
  const ids = groups.flatMap((g) => g.categories.flatMap((c) => c.tasks.map((t) => t.id)));
  assert.equal(new Set(ids).size, tasks.length);
  assert.equal(ids.length, tasks.length);
});

test("manual order crosses due dates and projects and appends newly imported tasks", () => {
  const tasks = [
    { ...task("late", "2026-11-06", "Work"), order: 2 },
    { ...task("future", "2026-11-08", "Study"), order: 0 },
    { ...task("done", undefined, "Work", true), order: 1 },
    task("new", "2026-11-07"),
  ];
  assert.deepEqual(
    sortTasks(tasks, "manual", "2026-11-07").map((t) => t.id),
    ["future", "done", "late", "new"],
  );
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["late", "future", "done", "new"],
  );
});

test("reordering filtered tasks preserves hidden slots, completed tasks, and all task data", () => {
  const tasks = [
    { ...task("one"), order: 0 },
    { ...task("hidden", undefined, "Study"), order: 1 },
    { ...task("two"), order: 2 },
    { ...task("done", undefined, "Work", true), order: 3 },
    { ...task("offscreen"), order: 4 },
  ];
  const reordered = reorderTasks(tasks, ["two", "one"], "2026-11-07");
  assert.deepEqual(
    reordered.map((t) => t.id),
    ["two", "hidden", "one", "done", "offscreen"],
  );
  assert.deepEqual(
    reordered.map((t) => t.order),
    [0, 1, 2, 3, 4],
  );
  assert.equal(reordered[3].completed, true);
  assert.equal(reordered[1].project, "Study");
  assert.deepEqual(
    tasks.map((t) => t.order),
    [0, 1, 2, 3, 4],
  );
});

test("automatic sorting leaves manual ranks intact and sorts dates across projects", () => {
  const tasks = [
    { ...task("Zulu", "2026-11-10", "Alpha"), priority: 4, order: 0 },
    { ...task("Bravo", "2026-11-08", "Zulu"), priority: 1, order: 1 },
    { ...task("Alpha"), priority: 2, order: 2 },
  ];
  const ids = (sort: Parameters<typeof sortTasks>[1]) =>
    sortTasks(tasks, sort, "2026-11-07").map((t) => t.id);
  assert.deepEqual(ids("due"), ["Bravo", "Zulu", "Alpha"]);
  assert.deepEqual(ids("priority"), ["Zulu", "Alpha", "Bravo"]);
  assert.deepEqual(ids("title"), ["Alpha", "Bravo", "Zulu"]);
  assert.deepEqual(ids("project"), ["Zulu", "Alpha", "Bravo"]);
  assert.deepEqual(ids("manual"), ["Zulu", "Bravo", "Alpha"]);
});

test("saved task order rejects duplicate, empty, oversized, and invalid IDs", () => {
  assert.equal(taskOrderSchema.safeParse({ taskIds: ["local", "todoist"] }).success, true);
  for (const taskIds of [
    [],
    ["same", "same"],
    [""],
    ["a".repeat(101)],
    Array.from({ length: 2001 }, (_, i) => String(i)),
  ]) {
    assert.equal(taskOrderSchema.safeParse({ taskIds }).success, false);
  }
});

test("import writes only selected active tasks and completion history from chosen or previously imported tasks", () => {
  const plan = planTodoistImport(
    [{ id: "chosen" }, { id: "unchecked" }, { id: "recurring" }],
    [{ id: "chosen" }, { id: "unrelated" }, { id: "already-imported" }, { id: "recurring" }],
    ["chosen"],
    ["already-imported", "recurring"],
  );
  assert.deepEqual(
    plan.active.map((t) => t.id),
    ["chosen"],
  );
  assert.deepEqual(
    plan.completions.map((t) => t.id),
    ["chosen", "already-imported", "recurring"],
  );
  assert.deepEqual([...plan.completedTaskIds], ["chosen", "already-imported"]);
  assert.deepEqual(plan.missingIds, []);
});

test("import recognizes tasks completed after preview and detects IDs absent from the provider", () => {
  const plan = planTodoistImport(
    [{ id: 123 }],
    [{ id: "just-completed" }],
    ["123", "just-completed", "missing"],
    [],
  );
  assert.deepEqual(plan.active, [{ id: 123 }]);
  assert.deepEqual([...plan.completedTaskIds], ["just-completed"]);
  assert.deepEqual(plan.missingIds, ["missing"]);
});

test("sync removes missing imports while keeping unchecked active tasks, completions, and older history", () => {
  const plan = planTodoistImport(
    [{ id: "chosen" }, { id: "unchecked" }, { id: 123 }],
    [{ id: "completed" }, { id: "unrelated" }],
    ["chosen"],
    ["unchecked", "123", "completed", "deleted", "deleted-completed", "older-completed"],
    ["older-completed"],
  );
  assert.deepEqual(plan.removedIds, ["deleted", "deleted-completed"]);
  assert.deepEqual(plan.active, [{ id: "chosen" }]);
  assert.deepEqual(plan.completions, [{ id: "completed" }]);
  assert.deepEqual(plan.missingIds, []);
});

test("sync cleans up the last deleted import with an empty provider workspace and no selection", () => {
  const plan = planTodoistImport([], [], [], ["deleted", "older-completed"], ["older-completed"]);
  assert.deepEqual(plan.removedIds, ["deleted"]);
  assert.deepEqual(plan.active, []);
  assert.deepEqual(plan.completions, []);
  assert.deepEqual(plan.missingIds, []);
  assert.deepEqual(planTodoistImport([], [], [], []).removedIds, []);
});

test("Todoist sync accepts an empty import selection and still validates supplied IDs", () => {
  assert.deepEqual(todoistSyncSchema.parse({ taskIds: [] }), { taskIds: [] });
  assert.equal(todoistSyncSchema.safeParse({ taskIds: ["existing"] }).success, true);
  for (const value of [
    {},
    { taskIds: [""] },
    { taskIds: ["a".repeat(101)] },
    { taskIds: [123] },
    { taskIds: Array.from({ length: 2001 }, (_, i) => String(i)) },
  ])
    assert.equal(todoistSyncSchema.safeParse(value).success, false);
});

test("provider pages require an explicit list and valid IDs before planning task removal", () => {
  const records = [{ id: "one", content: "Keep task data" }, { id: 123 }];
  for (const value of [
    records,
    { results: records, next_cursor: null },
    { items: records, next_cursor: null },
  ])
    assert.deepEqual(todoistPageSchema.parse(value), { records, nextCursor: null });
  assert.deepEqual(todoistPageSchema.parse({ items: [], next_cursor: "next" }), {
    records: [],
    nextCursor: "next",
  });
  assert.deepEqual(todoistPageSchema.parse({ results: [], next_cursor: null }), {
    records: [],
    nextCursor: null,
  });
  for (const value of [
    {},
    null,
    { results: [] },
    { items: [] },
    { results: null },
    { results: "incomplete" },
    { items: [], next_cursor: 123 },
    { items: [{}] },
    { results: [{ id: "" }] },
    [{ content: "Missing ID" }],
  ])
    assert.equal(todoistPageSchema.safeParse(value).success, false);
});
