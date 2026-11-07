import { NextResponse } from "next/server";
import { api, body, db, requireUser } from "@/lib/server";
import { sessionSchema } from "@/lib/validation";
import { deleteStoredSession, saveStoredSession } from "@/lib/session-storage";
import { z } from "zod";

async function saveSession(request: Request, edit = false) {
  const userId = await requireUser();
  const value = sessionSchema.parse(await body(request));
  const session = edit ? { ...value, status: "finished" as const } : value;
  const saved = await saveStoredSession((await db()).collection("sessions"), session, userId, edit);
  return NextResponse.json({ session: saved?.deletedAt ? null : saved });
}

export const POST = api((request) => saveSession(request));
export const PATCH = api((request) => saveSession(request, true));
export const DELETE = api(async (request) => {
  const userId = await requireUser();
  const { id } = z.object({ id: z.uuid() }).parse(await body(request));
  await deleteStoredSession((await db()).collection("sessions"), id, userId);
  return NextResponse.json({ ok: true });
});
