import { NextResponse } from "next/server";
import { api, body, db, requireUser } from "@/lib/server";
import { sessionSchema } from "@/lib/validation";
export const POST = api(async (request) => {
  const userId = await requireUser();
  const session = sessionSchema.parse(await body(request));
  await (
    await db()
  )
    .collection("sessions")
    .updateOne(
      { _id: `${userId}:${session.id}` as never },
      { $setOnInsert: { ...session, userId } },
      { upsert: true },
    );
  return NextResponse.json({ session });
});
