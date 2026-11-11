import type { Task } from "./types";

export type TaskSort = "manual" | "due" | "priority" | "title" | "project";

export function searchTasks(tasks: Task[], query: string): Task[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return tasks;
  return tasks.filter((task) =>
    [task.title, task.project || "Personal"].some((value) =>
      value.toLocaleLowerCase().includes(search),
    ),
  );
}

export function sortTasks(tasks: Task[], sort: TaskSort, today: string): Task[] {
  // Preserve the previous grouped order for workspaces without a custom order.
  const ordered = groupTasks(tasks, today).flatMap((group) =>
    group.categories.flatMap((category) => category.tasks),
  );
  ordered.sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
  if (sort === "manual") return ordered;
  return ordered.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "project") return (a.project || "Personal").localeCompare(b.project || "Personal");
    if (sort === "priority") return b.priority - a.priority;
    return (
      Number(a.completed) - Number(b.completed) || (a.due || "9999").localeCompare(b.due || "9999")
    );
  });
}

// Replace only visible slots, keeping filtered, completed, and offscreen tasks in place.
export function reorderTasks(tasks: Task[], visibleIds: string[], today: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ids = [...new Set(visibleIds)].filter((id) => byId.has(id));
  const visible = new Set(ids);
  let index = 0;
  return sortTasks(tasks, "manual", today).map((task, order) => ({
    ...(visible.has(task.id) ? byId.get(ids[index++])! : task),
    order,
  }));
}

export function taskDueLabel(task: Task, today: string) {
  if (!task.due) return "No due date";
  const date = task.due.slice(0, 10);
  return date < today ? "Overdue" : date === today ? "Due today" : "Upcoming";
}

export function isDueToday(task: Task, today: string) {
  return !task.completed && task.due?.slice(0, 10) === today;
}

export function groupTasks(tasks: Task[], today: string) {
  const buckets = [
    {
      id: "overdue",
      label: "Overdue",
      matches: (t: Task) => !t.completed && !!t.due && t.due.slice(0, 10) < today,
    },
    { id: "today", label: "Due today", matches: (t: Task) => isDueToday(t, today) },
    {
      id: "upcoming",
      label: "Upcoming",
      matches: (t: Task) => !t.completed && !!t.due && t.due.slice(0, 10) > today,
    },
    { id: "no-date", label: "No due date", matches: (t: Task) => !t.completed && !t.due },
    { id: "completed", label: "Completed", matches: (t: Task) => t.completed },
  ];
  return buckets.flatMap(({ id, label, matches }) => {
    const matching = tasks.filter(matches);
    const names = [...new Set(matching.map((t) => t.project || "Personal"))].sort((a, b) =>
      a.localeCompare(b),
    );
    if (!matching.length) return [];
    return [
      {
        id,
        label,
        count: matching.length,
        categories: names.map((name) => ({
          name,
          tasks: matching
            .filter((t) => (t.project || "Personal") === name)
            .sort(
              (a, b) =>
                (a.due || "").localeCompare(b.due || "") ||
                b.priority - a.priority ||
                a.title.localeCompare(b.title),
            ),
        })),
      },
    ];
  });
}
