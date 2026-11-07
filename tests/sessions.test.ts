import { test } from "node:test";
import assert from "node:assert/strict";
import { applySessionQueue, focusSnapshot, readSessionQueue, upsertSession } from "../lib/sessions";
import { sessionSchema } from "../lib/validation";
import type { FocusSession, TimerState } from "../lib/types";
import { aggregateStats } from "../lib/stats";

const start = new Date("2026-11-07T08:00:00Z").getTime();
const timer: TimerState = {
  id: crypto.randomUUID(),
  mode: "focus",
  running: true,
  endsAt: start + 1800_000,
  startedAt: new Date(start).toISOString(),
  remaining: 1800,
  elapsed: 0,
  round: 1,
};

test("cumulative heartbeats and the final save count each focused second once", () => {
  let sessions: FocusSession[] = [];
  for (const seconds of [60, 120, 180]) {
    const snapshot = focusSnapshot(timer, "active", false, start + seconds * 1000)!;
    assert.equal(snapshot.seconds, seconds);
    assert.equal(snapshot.completed, false);
    sessions = upsertSession(sessions, snapshot);
  }
  sessions = upsertSession(sessions, focusSnapshot(timer, "finished", true, start + 1900_000)!);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].seconds, 1800);
  assert.equal(sessions[0].endedAt, new Date(timer.endsAt!).toISOString());
  assert.equal(sessions[0].completed, true);
  assert.equal(
    aggregateStats(sessions, [], "day", new Date(start)).reduce(
      (total, row) => total + row.minutes,
      0,
    ),
    30,
  );
});

test("pause and resume snapshots exclude idle time and cap delayed ticks", () => {
  const paused = { ...timer, running: false, endsAt: null, remaining: 1760, elapsed: 40 };
  assert.equal(focusSnapshot(paused, "active", false, start + 600_000)!.seconds, 40);
  const resumed = { ...paused, running: true, endsAt: start + 600_000 + 1760_000 };
  assert.equal(focusSnapshot(resumed, "active", false, start + 620_000)!.seconds, 60);
  assert.equal(focusSnapshot(resumed, "finished", true, start + 9000_000)!.seconds, 1800);
  assert.equal(focusSnapshot({ ...timer, mode: "rest" }, "active", false, start + 60_000), null);
  assert.equal(focusSnapshot(timer, "active", false, start + 500), null);
});

test("late and out-of-order heartbeats cannot undo final saves or manual edits", () => {
  const active = focusSnapshot(timer, "active", false, start + 120_000)!;
  assert.deepEqual(upsertSession([active], { ...active, seconds: 60 }), [active]);
  const edited = { ...active, status: "finished" as const, seconds: 30 };
  assert.deepEqual(upsertSession([edited], active), [edited]);
  const legacy = { ...edited, status: undefined };
  assert.deepEqual(upsertSession([legacy], active), [legacy]);
});

test("pending corrections and deletions take precedence over downloaded history", () => {
  const session = focusSnapshot(timer, "finished", true, start + 1800_000)!;
  const corrected = { ...session, seconds: 300, completed: false };
  const pending = readSessionQueue([
    null,
    { id: "broken", method: "PATCH", revision: "bad" },
    { id: session.id, method: "PATCH", revision: "edit", session: corrected },
  ]);
  assert.equal(pending.length, 1);
  assert.deepEqual(applySessionQueue([session], pending), [corrected]);
  assert.deepEqual(
    applySessionQueue([session], [{ id: session.id, revision: "delete", method: "DELETE" }]),
    [],
  );
  const legacy = readSessionQueue([session]);
  assert.equal(legacy[0].method, "POST");
  assert.deepEqual(applySessionQueue([], legacy), [session]);
});

test("validation accepts legacy sessions and rejects contradictory or inflated corrections", () => {
  const session = focusSnapshot(timer, "finished", true, start + 1800_000)!;
  const { status: _status, ...legacy } = session;
  assert.equal(sessionSchema.parse(legacy).status, "finished");
  assert.ok(!sessionSchema.safeParse({ ...session, status: "active" }).success);
  assert.ok(!sessionSchema.safeParse({ ...session, seconds: 1803 }).success);
  assert.ok(
    !sessionSchema.safeParse({ ...session, endedAt: new Date(start - 1000).toISOString() }).success,
  );
  assert.ok(!sessionSchema.safeParse({ ...session, seconds: 0 }).success);
});
