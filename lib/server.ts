import "server-only";
import { MongoClient } from "mongodb";
import { getAuth0 } from "./auth0";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { refreshTodoistTokens, TodoistOAuthError } from "./todoist-oauth";

const globalMongo = globalThis as unknown as { mongo?: Promise<MongoClient> };
export async function db() {
  if (!process.env.MONGODB_URI)
    throw new ApiError(
      "MongoDB is not configured. Your guest workspace stays on this device.",
      503,
    );
  globalMongo.mongo ??= new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 6000 })
    .connect()
    .catch((error) => {
      globalMongo.mongo = undefined;
      throw error;
    });
  return (await globalMongo.mongo).db(process.env.MONGODB_DB || "pom");
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function requireUser() {
  const session = await getAuth0()?.getSession();
  if (!session?.user?.sub) throw new ApiError("Sign in to sync your workspace.", 401);
  return session.user.sub;
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || "http://localhost:3000").origin;
  const allowed = new Set([expected]);
  const base = new URL(expected);
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  ) {
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      const local = new URL(base);
      local.hostname = hostname;
      allowed.add(local.origin);
    }
  }
  if (!origin || !allowed.has(origin))
    throw new ApiError("This request must come from your Pom workspace.", 403);
}
export async function body(request: Request, limit = 200_000) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new ApiError("Request is too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) throw new ApiError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Invalid request body.");
  }
}
export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) assertOrigin(request);
      const response = await handler(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof ApiError)
        return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError)
        return NextResponse.json(
          { error: error.issues[0]?.message || "Invalid input." },
          { status: 400 },
        );
      console.error("Pom API error", error instanceof Error ? error.name : "Unknown");
      return NextResponse.json(
        { error: "Something didn’t connect. Please try again." },
        { status: 500 },
      );
    }
  };
}
function tokenKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new ApiError("Todoist token encryption is not configured.", 503);
  return Buffer.from(key, "hex");
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}
export function decryptToken(value: string) {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString(
    "utf8",
  );
}
const pendingTodoistRefreshes = new Map<string, Promise<string>>();

async function getTodoistToken(userId: string) {
  const collection = (await db()).collection("connections");
  const filter = { _id: `todoist:${userId}` as never };
  const connection = await collection.findOne(filter);
  if (!connection) throw new ApiError("Connect Todoist in Settings to import your tasks.", 409);
  // Legacy Todoist applications can still issue tokens without an expiry.
  if (!connection.expiresAt || new Date(connection.expiresAt).getTime() > Date.now() + 60000) {
    return decryptToken(connection.token);
  }
  if (!connection.refreshToken)
    throw new ApiError("Reconnect Todoist in Settings to renew your connection.", 409);
  if (!process.env.TODOIST_CLIENT_ID || !process.env.TODOIST_CLIENT_SECRET)
    throw new ApiError("Todoist app credentials are not configured.", 503);

  // A database lease prevents two server instances from rotating the same token.
  const owner = crypto.randomUUID();
  const locked = await collection.findOneAndUpdate(
    {
      ...filter,
      token: connection.token,
      $or: [{ refreshUntil: { $exists: false } }, { refreshUntil: { $lte: new Date() } }],
    },
    { $set: { refreshOwner: owner, refreshUntil: new Date(Date.now() + 20000) } },
  );
  if (!locked) {
    const current = await collection.findOne(filter);
    if (current && current.token !== connection.token) return decryptToken(current.token);
    throw new ApiError("Todoist is refreshing your connection. Please try again in a moment.", 409);
  }
  try {
    const tokens = await refreshTodoistTokens(
      decryptToken(connection.refreshToken),
      process.env.TODOIST_CLIENT_ID,
      process.env.TODOIST_CLIENT_SECRET,
    );
    const result = await collection.updateOne(
      { ...filter, refreshOwner: owner, token: connection.token },
      {
        $set: {
          token: encryptToken(tokens.accessToken),
          refreshToken: encryptToken(tokens.refreshToken!),
          expiresAt: new Date(Date.now() + tokens.expiresIn! * 1000),
        },
        $unset: { refreshOwner: "", refreshUntil: "" },
      },
    );
    // A fresh OAuth connection takes precedence over an older in-flight refresh.
    if (!result.matchedCount) {
      const current = await collection.findOne(filter);
      if (!current) throw new ApiError("Reconnect Todoist in Settings.", 409);
      return decryptToken(current.token);
    }
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof TodoistOAuthError) throw new ApiError(error.message, error.status);
    throw error;
  } finally {
    await collection.updateOne(
      { ...filter, refreshOwner: owner },
      { $unset: { refreshOwner: "", refreshUntil: "" } },
    );
  }
}

export async function todoistToken(userId: string): Promise<string> {
  const pending = pendingTodoistRefreshes.get(userId);
  if (pending) return pending;
  const operation = getTodoistToken(userId);
  pendingTodoistRefreshes.set(userId, operation);
  try {
    return await operation;
  } finally {
    if (pendingTodoistRefreshes.get(userId) === operation) pendingTodoistRefreshes.delete(userId);
  }
}
