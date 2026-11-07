import { NextResponse } from "next/server";
import { authConfigured, getAuth0 } from "@/lib/auth0";
import { api, db } from "@/lib/server";

export const GET = api(async () => {
  const session = await getAuth0()?.getSession();
  const user = session?.user;
  let todoistConnected = false;
  if (user?.sub && process.env.MONGODB_URI) {
    try {
      todoistConnected = Boolean(
        await (
          await db()
        )
          .collection("connections")
          .findOne({ _id: `todoist:${user.sub}` as never }, { projection: { _id: 1 } }),
      );
    } catch {
      /* Authentication remains available during a database outage. Workspace sync reports its own error. */
    }
  }
  return NextResponse.json({
    user: user
      ? {
          id: user.sub,
          name: user.name || user.nickname || "Friend",
          email: user.email,
          picture: user.picture,
        }
      : null,
    services: {
      auth: authConfigured(),
      database: Boolean(process.env.MONGODB_URI),
      ai: Boolean(process.env.OPENROUTER_API_KEY),
      todoist: Boolean(
        process.env.TODOIST_CLIENT_ID &&
        process.env.TODOIST_CLIENT_SECRET &&
        process.env.TOKEN_ENCRYPTION_KEY,
      ),
    },
    todoistConnected,
  });
});
