import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateStats, formatMinutes, localDateKey, streakDays } from "../lib/stats";
import { DEFAULT_PREFERENCES, type FocusSession, type Task } from "../lib/types";
import { preferencesSchema, sessionSchema } from "../lib/validation";

const session = (start: Date, end: Date, seconds: number): FocusSession => ({
  id: crypto.randomUUID(),
  startedAt: start.toISOString(),
  endedAt: end.toISOString(),
  seconds,
  completed: true,
});
test("focus time spanning midnight belongs to both days", () => {
  const s = session(new Date(2026, 10, 2, 23, 50), new Date(2026, 10, 3, 0, 20), 1800);
  const week = aggregateStats([s], [], "week", new Date(2026, 10, 3));
  assert.equal(week[0].minutes, 10);
  assert.equal(week[1].minutes, 20);
});
test("paused time does not inflate total recorded focus", () => {
  const s = session(new Date(2026, 10, 3, 10), new Date(2026, 10, 3, 11), 1800);
  const today = aggregateStats([s], [], "day", new Date(2026, 10, 3));
  assert.equal(
    today.reduce((n, d) => n + d.minutes, 0),
    30,
  );
});
test("week starts on Monday and completion counts use the local date", () => {
  const tasks: Task[] = [
    {
      id: "t",
      title: "Study",
      project: "Personal",
      priority: 1,
      source: "local",
      completed: true,
      completedAt: new Date(2026, 10, 3, 12).toISOString(),
    },
  ];
  const week = aggregateStats([], tasks, "week", new Date(2026, 10, 7));
  assert.equal(week[0].date, "2026-11-02");
  assert.equal(week[1].tasks, 1);
  assert.equal(
    week.reduce((n, d) => n + d.tasks, 0),
    1,
  );
});
test("month handles leap days and avoids counting adjacent months", () => {
  const s = session(new Date(2024, 1, 29, 10), new Date(2024, 1, 29, 10, 30), 1800);
  const month = aggregateStats([s], [], "month", new Date(2024, 1, 29));
  assert.equal(month.length, 29);
  assert.equal(month[28].minutes, 30);
  assert.equal(
    aggregateStats([s], [], "month", new Date(2024, 2, 1)).reduce((n, d) => n + d.minutes, 0),
    0,
  );
});
test("streak permits today to be unfinished, stops at a missed day, and deduplicates days", () => {
  const make = (day: number) =>
    session(new Date(2026, 10, day, 10), new Date(2026, 10, day, 10, 30), 1800);
  assert.equal(streakDays([make(4), make(5), make(6), make(6)], new Date(2026, 10, 7)), 3);
  assert.equal(streakDays([make(4), make(6)], new Date(2026, 10, 7)), 1);
  assert.equal(streakDays([], new Date(2026, 10, 7)), 0);
});
test("duration display and local date keys remain readable", () => {
  assert.equal(formatMinutes(75), "1h 15m");
  assert.equal(formatMinutes(59.8), "1h 0m");
  assert.equal(localDateKey(new Date(2026, 0, 2)), "2026-01-02");
});
test("settings enforce sensible durations and known themes", () => {
  assert.ok(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success);
  assert.ok(!preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, focus: 0 }).success);
  assert.ok(!preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, theme: "unknown" }).success);
});
test("session count defaults for existing preferences and rejects invalid break intervals", () => {
  const { sessionsBeforeLongBreak, ...legacy } = DEFAULT_PREFERENCES;
  assert.equal(preferencesSchema.parse(legacy).sessionsBeforeLongBreak, sessionsBeforeLongBreak);
  for (const count of [0, 13, 2.5]) {
    assert.ok(!preferencesSchema.safeParse({ ...legacy, sessionsBeforeLongBreak: count }).success);
  }
  assert.ok(preferencesSchema.safeParse({ ...legacy, sessionsBeforeLongBreak: 1 }).success);
  assert.ok(preferencesSchema.safeParse({ ...legacy, sessionsBeforeLongBreak: 12 }).success);
});
test("server rejects focus sessions that claim more time than elapsed", () => {
  const end = new Date(Date.now() - 1000),
    start = new Date(end.getTime() - 60000);
  assert.ok(sessionSchema.safeParse(session(start, end, 60)).success);
  assert.ok(!sessionSchema.safeParse(session(start, end, 1800)).success);
  assert.ok(!sessionSchema.safeParse(session(end, start, 60)).success);
});
