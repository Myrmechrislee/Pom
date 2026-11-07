import type { FocusSession, Task } from "./types";

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function aggregateStats(
  sessions: FocusSession[],
  tasks: Pick<Task, "completedAt">[],
  period: "day" | "week" | "month",
  now = new Date(),
) {
  const count =
    period === "day"
      ? 24
      : period === "week"
        ? 7
        : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const start = new Date(now.getFullYear(), now.getMonth(), period === "month" ? 1 : now.getDate());
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(start);
    if (period === "day") from.setHours(i);
    else from.setDate(start.getDate() + i);
    const to = new Date(from);
    if (period === "day") to.setHours(to.getHours() + 1);
    else to.setDate(to.getDate() + 1);
    // Allocate actual focus time across date boundaries rather than crediting all of it to the end day.
    const seconds = sessions.reduce((total, s) => {
      const a = new Date(s.startedAt).getTime(),
        b = new Date(s.endedAt).getTime();
      const overlap = Math.max(0, Math.min(b, to.getTime()) - Math.max(a, from.getTime()));
      return total + (b > a ? (s.seconds * overlap) / (b - a) : 0);
    }, 0);
    return {
      label:
        period === "day"
          ? `${String(i).padStart(2, "0")}:00`
          : period === "week"
            ? from.toLocaleDateString("en", { weekday: "short" })
            : String(i + 1),
      minutes: Math.round((seconds / 60) * 10) / 10,
      tasks: tasks.filter(
        (t) => t.completedAt && new Date(t.completedAt) >= from && new Date(t.completedAt) < to,
      ).length,
      date: localDateKey(from),
    };
  });
}

export function streakDays(sessions: FocusSession[], now = new Date()) {
  const days = new Set(
    sessions.filter((s) => s.seconds >= 60).map((s) => localDateKey(new Date(s.endedAt))),
  );
  const date = new Date(now);
  if (!days.has(localDateKey(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (days.has(localDateKey(date))) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

export function formatMinutes(minutes: number) {
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)}h ${rounded % 60}m` : `${rounded}m`;
}
