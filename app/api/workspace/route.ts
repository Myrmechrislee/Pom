import { NextResponse } from "next/server";
import { api, db, requireUser } from "@/lib/server";
import { DEFAULT_PREFERENCES } from "@/lib/types";

export const GET = api(async () => {
  const userId = await requireUser(),
    database = await db();
  const [profile, tasks, sessions, backgrounds, completions] = await Promise.all([
    database.collection("profiles").findOne({ _id: userId as never }),
    database
      .collection("tasks")
      .find({ userId }, { projection: { _id: 0, userId: 0 } })
      .sort({ createdAt: 1 })
      .limit(2000)
      .toArray(),
    database
      .collection("sessions")
      .find({ userId, deletedAt: { $exists: false } }, { projection: { _id: 0, userId: 0 } })
      .sort({ endedAt: -1 })
      .toArray(),
    database
      .collection("backgrounds")
      .find({ userId }, { projection: { _id: 0, userId: 0, data: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    database
      .collection("completions")
      .find({ userId }, { projection: { _id: 0, userId: 0 } })
      .sort({ completedAt: 1 })
      .limit(50000)
      .toArray(),
  ]);
  return NextResponse.json({
    preferences: { ...DEFAULT_PREFERENCES, ...profile?.preferences },
    tasks,
    completions,
    sessions,
    backgrounds,
  });
});
