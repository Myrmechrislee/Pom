import { NextResponse, type NextRequest } from "next/server";
import { api, db, requireUser, encryptToken, ApiError } from "@/lib/server";
import { parseTodoistTokens, TodoistOAuthError } from "@/lib/todoist-oauth";

export const GET = api(async (request) => {
  const userId = await requireUser(),
    url = new URL(request.url);
  const destination = new URL("/", process.env.APP_BASE_URL || "http://localhost:3000");
  const state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  const cookie = (request as NextRequest).cookies.get("pom_todoist_state")?.value;
  if (!state || state !== cookie)
    throw new ApiError("The connection expired. Please connect Todoist again.", 403);
  const database = await db();
  const transaction = await database
    .collection("oauthStates")
    .findOneAndDelete({ _id: state as never, userId, expiresAt: { $gt: new Date() } });
  if (!transaction || !code) {
    destination.searchParams.set("todoist", "cancelled");
    return NextResponse.redirect(destination);
  }
  const response = await fetch("https://api.todoist.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TODOIST_CLIENT_ID!,
      client_secret: process.env.TODOIST_CLIENT_SECRET!,
      code,
      redirect_uri: `${destination.origin}/api/todoist/callback`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError("Todoist couldn’t finish connecting. Please try again.", 502);
  let token;
  try {
    token = parseTodoistTokens(await response.json());
  } catch (error) {
    if (error instanceof TodoistOAuthError) throw new ApiError(error.message, error.status);
    throw error;
  }
  await database.collection("connections").updateOne(
    { _id: `todoist:${userId}` as never },
    {
      $set: {
        userId,
        provider: "todoist",
        token: encryptToken(token.accessToken),
        refreshToken: token.refreshToken ? encryptToken(token.refreshToken) : null,
        expiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null,
        connectedAt: new Date(),
      },
      $unset: { refreshOwner: "", refreshUntil: "" },
    },
    { upsert: true },
  );
  destination.searchParams.set("todoist", "connected");
  const result = NextResponse.redirect(destination);
  result.cookies.delete({ name: "pom_todoist_state", path: "/api/todoist" });
  return result;
});
