import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTodoistTokens, refreshTodoistTokens, TodoistOAuthError } from "../lib/todoist-oauth";

test("accepts legacy Todoist tokens and new expiring token sets", () => {
  assert.equal(parseTodoistTokens({ access_token: "legacy" }).accessToken, "legacy");
  assert.deepEqual(
    parseTodoistTokens({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }),
    {
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 3600,
    },
  );
  assert.throws(
    () => parseTodoistTokens({ access_token: "access", refresh_token: "refresh" }),
    TodoistOAuthError,
  );
  assert.throws(
    () => parseTodoistTokens({ access_token: "access", expires_in: -1 }),
    TodoistOAuthError,
  );
});

test("refresh sends confidential credentials server-side and retains the rotated token", async () => {
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.todoist.com/oauth/access_token");
    assert.equal(options?.method, "POST");
    const body = options?.body as URLSearchParams;
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "old-refresh");
    assert.equal(body.get("client_id"), "test-client");
    assert.equal(body.get("client_secret"), "test-secret");
    return Response.json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
  };
  assert.equal(
    (await refreshTodoistTokens("old-refresh", "test-client", "test-secret", transport))
      .refreshToken,
    "new-refresh",
  );
});

test("revoked tokens request reconnection, temporary failures remain retryable", async () => {
  for (const [status, expected] of [
    [400, 409],
    [401, 409],
    [503, 502],
  ]) {
    await assert.rejects(
      refreshTodoistTokens(
        "refresh",
        "client",
        "secret",
        async () => new Response(null, { status }),
      ),
      (error: unknown) => error instanceof TodoistOAuthError && error.status === expected,
    );
  }
  await assert.rejects(
    refreshTodoistTokens("refresh", "client", "secret", async () =>
      Response.json({ access_token: "access", expires_in: 3600 }),
    ),
    TodoistOAuthError,
  );
});
