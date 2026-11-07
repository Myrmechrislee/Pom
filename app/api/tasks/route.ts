import { NextResponse } from "next/server";
import { api, body, db, requireUser, ApiError, todoistToken } from "@/lib/server";
import { taskSchema } from "@/lib/validation";
import { z } from "zod";
export const POST = api(async (request) => {
  const userId = await requireUser(),
    value = taskSchema.parse(await body(request));
  const task = { ...value, id: crypto.randomUUID(), completed: false, source: "local" };
  await (
    await db()
  )
    .collection("tasks")
    .insertOne({
      ...task,
      _id: `${userId}:${task.id}` as never,
      userId,
      createdAt: new Date().toISOString(),
    });
  return NextResponse.json({ task });
});
export const PATCH = api(async (request) => {
  const userId = await requireUser();
  const { id, completed } = z
    .object({ id: z.string().min(1).max(100), completed: z.boolean() })
    .parse(await body(request));
  const collection = (await db()).collection("tasks");
  const task = await collection.findOne({ _id: `${userId}:${id}` as never, userId });
  if (!task) throw new ApiError("Task not found.", 404);
  if (task.source === "todoist" && Boolean(task.completed) !== completed) {
    const response = await fetch(
      `https://api.todoist.com/api/v1/tasks/${encodeURIComponent(id)}/${completed ? "close" : "reopen"}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await todoistToken(userId)}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ApiError("Todoist couldn’t update this task. Reconnect or try again.", 502);
  }
  const completedAt = completed ? task.completedAt || new Date().toISOString() : undefined;
  const completions = (await db()).collection("completions");
  if (completed && completedAt) {
    const id = `${task.id}:${completedAt}`;
    await completions.updateOne(
      { _id: `${userId}:${id}` as never },
      {
        $setOnInsert: {
          id,
          userId,
          taskId: task.id,
          title: task.title,
          completedAt,
          ...(task.source === "todoist" ? { providerSynced: false } : {}),
        },
      },
      { upsert: true },
    );
  } else if (task.completedAt)
    await completions.deleteOne({ userId, taskId: task.id, completedAt: task.completedAt });
  await collection.updateOne(
    { _id: task._id },
    completed
      ? { $set: { completed, completedAt } }
      : { $set: { completed }, $unset: { completedAt: "" } },
  );
  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      project: task.project,
      priority: task.priority,
      source: task.source,
      due: task.due,
      completed,
      completedAt,
    },
  });
});
export const DELETE = api(async (request) => {
  const userId = await requireUser();
  const { id } = z.object({ id: z.string().max(100) }).parse(await body(request));
  await (
    await db()
  )
    .collection("tasks")
    .deleteOne({ _id: `${userId}:${id}` as never, userId, source: "local" });
  return NextResponse.json({ ok: true });
});
