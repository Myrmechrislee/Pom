import type { Document } from "mongodb";
import type { FocusSession, TimerState } from "./types";

export function focusSnapshot(
  timer: TimerState,
  status: "active" | "finished",
  completed = false,
  now = Date.now(),
): FocusSession | null {
  const elapsed =
    timer.elapsed +
    (timer.running && timer.endsAt
      ? Math.min(
          timer.remaining,
          Math.max(0, (now - (timer.endsAt - timer.remaining * 1000)) / 1000),
        )
      : 0);
  if (timer.mode !== "focus" || !timer.startedAt || elapsed < 1) return null;
  return {
    id: timer.id,
    startedAt: timer.startedAt,
    endedAt: new Date(
      Math.min(now, timer.running && timer.endsAt ? timer.endsAt : now),
    ).toISOString(),
    seconds: Math.floor(elapsed),
    completed,
    taskId: timer.taskId,
    status,
  };
}

export function upsertSession(sessions: FocusSession[], session: FocusSession): FocusSession[] {
  const existing = sessions.find((entry) => entry.id === session.id);
  // Late heartbeats cannot undo a final save or a manual correction.
  if (
    existing &&
    session.status === "active" &&
    (existing.status !== "active" || existing.seconds > session.seconds)
  )
    return sessions;
  return [...sessions.filter((entry) => entry.id !== session.id), session];
}

// Use one atomic update so concurrent heartbeats never regress a session. Keeping
// deletion tombstones also prevents delayed/offline saves from restoring a log.
export function sessionWritePipeline(
  session: FocusSession,
  userId: string,
  edit = false,
): Document[] {
  return [
    {
      $replaceWith: {
        $cond: [
          {
            $and: [
              { $eq: [{ $type: "$deletedAt" }, "missing"] },
              ...(edit
                ? []
                : [
                    {
                      $or: [
                        { $eq: [{ $type: "$id" }, "missing"] },
                        {
                          $and: [
                            { $eq: ["$status", "active"] },
                            { $lte: ["$seconds", session.seconds] },
                          ],
                        },
                      ],
                    },
                  ]),
            ],
          },
          {
            $mergeObjects: [
              { _id: "$_id" },
              // Literal protects task IDs and other user text from expression parsing.
              { $literal: { ...session, userId } },
            ],
          },
          "$$ROOT",
        ],
      },
    },
  ];
}

export type SessionMutation = {
  id: string;
  revision: string;
} & ({ method: "POST" | "PATCH"; session: FocusSession } | { method: "DELETE" });

export function readSessionQueue(value: unknown): SessionMutation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry.id !== "string") return [];
    if (
      typeof entry.revision === "string" &&
      (entry.method === "DELETE" ||
        (["POST", "PATCH"].includes(entry.method) &&
          entry.session?.id === entry.id &&
          typeof entry.session?.seconds === "number" &&
          typeof entry.session?.startedAt === "string" &&
          typeof entry.session?.endedAt === "string"))
    )
      return [entry as SessionMutation];
    // Migrate the previous queue of completed sessions.
    if (typeof entry.seconds === "number" && typeof entry.startedAt === "string")
      return [{ id: entry.id, revision: crypto.randomUUID(), method: "POST", session: entry }];
    return [];
  });
}

export function applySessionQueue(sessions: FocusSession[], pending: SessionMutation[]) {
  return pending.reduce(
    (result, mutation) =>
      mutation.method === "DELETE"
        ? result.filter((entry) => entry.id !== mutation.id)
        : mutation.method === "PATCH"
          ? [...result.filter((entry) => entry.id !== mutation.id), mutation.session]
          : upsertSession(result, mutation.session),
    sessions,
  );
}
