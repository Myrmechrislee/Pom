import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasks, isDueToday } from "../lib/tasks";
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
