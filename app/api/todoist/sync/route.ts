import { NextResponse } from "next/server";
import { api, ApiError, body, db, requireUser, todoistToken } from "@/lib/server";
import { planTodoistImport } from "@/lib/todoist-import";
import { todoistPageSchema, todoistSyncSchema } from "@/lib/validation";

async function getAll(token: string, path: string, query: Record<string, string> = {}) {
  const results: Record<string, unknown>[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URL(`https://api.todoist.com/api/v1/${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new ApiError("Todoist couldn’t sync. Please try again or reconnect your account.", 502);
    const page = todoistPageSchema.safeParse(await response.json());
    if (!page.success || (page.data.nextCursor && cursors.has(page.data.nextCursor)))
      throw new ApiError("Todoist returned an incomplete response. Please try syncing again.", 502);
    results.push(...page.data.records);
    cursor = page.data.nextCursor;
    if (cursor) cursors.add(cursor);
    if (results.length > 10000)
      throw new ApiError("This Todoist workspace is too large to import in one sync.", 413);
  } while (cursor);
  return results;
}

export const GET = api(async () => {
  const userId = await requireUser();
  const token = await todoistToken(userId);
  const [tasks, projects] = await Promise.all([getAll(token, "tasks"), getAll(token, "projects")]);
  const names = new Map(projects.map((p) => [String(p.id), String(p.name)]));
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: String(t.id),
      title: String(t.content),
      project: names.get(String(t.project_id)) || "Todoist",
      source: "todoist",
      priority: Number(t.priority) || 1,
      due: (t.due as { date?: string } | null)?.date,
      completed: false,
    })),
  });
});

export const POST = api(async (request) => {
  const userId = await requireUser();
  const { taskIds } = todoistSyncSchema.parse(await body(request));
  const token = await todoistToken(userId),
    database = await db();
  const [tasks, projects] = await Promise.all([getAll(token, "tasks"), getAll(token, "projects")]);
  // Include completions that happened while the active-task pages were loading.
  const until = new Date(),
    since = new Date(until.getTime() - 89 * 86400000);
  const completed = await getAll(token, "tasks/completed/by_completion_date", {
    since: since.toISOString(),
    until: until.toISOString(),
  });
  const names = new Map(projects.map((p) => [String(p.id), String(p.name)]));
  const collection = database.collection("tasks");
  const imported = await collection
    .find({ userId, source: "todoist" }, { projection: { id: 1, completed: 1, completedAt: 1 } })
    .toArray();
  const plan = planTodoistImport(
    tasks,
    completed,
    taskIds,
    imported.map((t) => String(t.id)),
    // Absence from a bounded history is not evidence that an older completion was deleted.
    imported
      .filter((t) => t.completed && (!t.completedAt || t.completedAt < since.toISOString()))
      .map((t) => String(t.id)),
  );
  if (plan.missingIds.length)
    throw new ApiError(
      "Some tasks are no longer available. Close this chooser and load Todoist again.",
      409,
    );
  // Only chosen tasks enter the workspace. Existing imported tasks retain completion sync.
  for (const t of plan.completions) {
    const id = String(t.id);
    if (typeof t.completed_at === "string") {
      const completedAt = new Date(t.completed_at).toISOString();
      const events = database.collection("completions");
      // A close initiated in Pom has a provisional timestamp. Acknowledge it once,
      // rather than counting the provider's timestamp as another completion.
      if (!(await events.findOne({ userId, taskId: id, providerCompletedAt: completedAt }))) {
        const pending = await events.findOne({
          userId,
          taskId: id,
          providerSynced: false,
          completedAt: {
            $gte: new Date(new Date(completedAt).getTime() - 30000).toISOString(),
            $lte: new Date(new Date(completedAt).getTime() + 30000).toISOString(),
          },
        });
        if (pending)
          await events.updateOne(
            { _id: pending._id },
            { $set: { providerSynced: true, completedAt, providerCompletedAt: completedAt } },
          );
        else {
          const eventId = `${id}:${completedAt}`;
          await events.updateOne(
            { _id: `${userId}:${eventId}` as never },
            {
              $setOnInsert: {
                id: eventId,
                userId,
                taskId: id,
                title: String(t.content),
                completedAt,
                providerCompletedAt: completedAt,
                providerSynced: true,
              },
            },
            { upsert: true },
          );
        }
      }
    }
    // An unselected recurring task may already be active for its next occurrence.
    if (!plan.completedTaskIds.has(id)) continue;
    await collection.updateOne(
      { _id: `${userId}:${id}` as never },
      {
        $set: {
          id,
          userId,
          title: String(t.content),
          project: names.get(String(t.project_id)) || "Todoist",
          source: "todoist",
          priority: Number(t.priority) || 1,
          completed: true,
          completedAt: t.completed_at,
        },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true },
    );
  }
  for (const t of plan.active) {
    const id = String(t.id);
    await collection.updateOne(
      { _id: `${userId}:${id}` as never },
      {
        $set: {
          id,
          userId,
          title: String(t.content),
          project: names.get(String(t.project_id)) || "Todoist",
          source: "todoist",
          priority: Number(t.priority) || 1,
          due: (t.due as { date?: string } | null)?.date,
          completed: false,
        },
        $unset: { completedAt: "" },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true },
    );
  }
  if (plan.removedIds.length)
    await collection.deleteMany({
      userId,
      source: "todoist",
      id: { $in: plan.removedIds },
      // Keep tasks completed locally while this sync was in flight.
      $or: [
        { completed: { $ne: true } },
        { completedAt: { $gte: since.toISOString(), $lt: until.toISOString() } },
      ],
    });
  const all = await collection
    .find({ userId }, { projection: { _id: 0, userId: 0 } })
    .sort({ createdAt: 1 })
    .limit(2000)
    .toArray();
  const completions = await database
    .collection("completions")
    .find({ userId }, { projection: { _id: 0, userId: 0 } })
    .sort({ completedAt: 1 })
    .limit(50000)
    .toArray();
  return NextResponse.json({ tasks: all, completions, count: new Set(taskIds).size });
});
