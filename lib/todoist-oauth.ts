export type TodoistTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

export class TodoistOAuthError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function parseTodoistTokens(value: unknown): TodoistTokenSet {
  const data = value as Record<string, unknown> | null;
  if (
    !data ||
    typeof data.access_token !== "string" ||
    !data.access_token ||
    (data.refresh_token !== undefined &&
      (typeof data.refresh_token !== "string" || !data.refresh_token)) ||
    (data.expires_in !== undefined &&
      (typeof data.expires_in !== "number" ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0)) ||
    (data.refresh_token && data.expires_in === undefined)
  )
    throw new TodoistOAuthError("Todoist returned an invalid token response. Please reconnect.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
  };
}

export async function refreshTodoistTokens(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  transport: typeof fetch = fetch,
): Promise<TodoistTokenSet> {
  const response = await transport("https://api.todoist.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const revoked = response.status === 400 || response.status === 401;
    throw new TodoistOAuthError(
      revoked
        ? "Your Todoist connection has expired. Reconnect in Settings."
        : "Todoist couldn’t refresh your connection. Please try again.",
      revoked ? 409 : 502,
    );
  }
  const tokens = parseTodoistTokens(await response.json());
  if (!tokens.refreshToken)
    throw new TodoistOAuthError("Todoist didn’t return a new refresh token. Please reconnect.");
  return tokens;
}
