import { NextResponse } from "next/server";
import { api, body, db, requireUser } from "@/lib/server";
import { preferencesSchema } from "@/lib/validation";
export const PATCH = api(async (request) => {
  const userId = await requireUser();
  const preferences = preferencesSchema.parse(await body(request));
  await (
    await db()
  )
    .collection("profiles")
    .updateOne({ _id: userId as never }, { $set: { preferences } }, { upsert: true });
  return NextResponse.json({ preferences });
});
