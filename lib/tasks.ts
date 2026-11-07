import type { Task } from "./types";

export function isDueToday(task: Task, today: string) {
  return !task.completed && task.due?.slice(0, 10) === today;
}

export function groupTasks(tasks: Task[], today: string) {
  const buckets = [
    { id: "today", label: "Due today", matches: (t: Task) => isDueToday(t, today) },
    {
      id: "overdue",
      label: "Overdue",
      matches: (t: Task) => !t.completed && !!t.due && t.due.slice(0, 10) < today,
    },
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
