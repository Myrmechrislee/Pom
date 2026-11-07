import { NextResponse } from "next/server";
import { api, requireUser, ApiError, db } from "@/lib/server";
import { randomBytes } from "node:crypto";
export const GET = api(async () => {
  const userId = await requireUser();
  if (
    !process.env.TODOIST_CLIENT_ID ||
    !process.env.TODOIST_CLIENT_SECRET ||
    !process.env.TOKEN_ENCRYPTION_KEY
  )
    throw new ApiError("Add the Todoist app credentials and token encryption key to connect.", 503);
  const database = await db();
  const state = randomBytes(32).toString("hex");
  await database.collection("oauthStates").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database
    .collection("oauthStates")
    .insertOne({ _id: state as never, userId, expiresAt: new Date(Date.now() + 600000) });
  const url = new URL("https://app.todoist.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.TODOIST_CLIENT_ID,
    scope: "data:read_write",
    state,
    response_type: "code",
    redirect_uri: `${process.env.APP_BASE_URL || "http://localhost:3000"}/api/todoist/callback`,
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("pom_todoist_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/todoist",
    maxAge: 600,
  });
  return response;
});
