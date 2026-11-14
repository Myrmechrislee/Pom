import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterImageError, requestOpenRouterImage } from "../lib/openrouter-images";

const options = {
  apiKey: "test-secret-key",
  model: "openai/gpt-image-2.6-sunburst",
  prompt: "A peaceful forest scene",
  referer: "https://pom.example",
};

test("image generation sends the configured model and returns supported image bytes without logging them", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  const image = {
    b64_json: Buffer.from("image bytes").toString("base64"),
    media_type: "image/png",
  };
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/images");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${options.apiKey}`);
    assert.deepEqual(JSON.parse(init.body as string), {
      model: options.model,
      prompt: options.prompt,
      aspect_ratio: "16:9",
      n: 1,
    });
    return Response.json({ data: [image] });
  };
  assert.deepEqual(await requestOpenRouterImage(options, transport), image);
  assert.equal(logs.mock.callCount(), 0);
});

test("provider errors retain their actual status, model, request ID, and reason in logs while redacting secrets", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  const transport: typeof fetch = async () =>
    Response.json(
      { error: { code: 502, message: `Provider failed; ${options.apiKey}; ${options.prompt}` } },
      { status: 502, headers: { "x-request-id": "diagnostic-id" } },
    );
  await assert.rejects(requestOpenRouterImage(options, transport), /OpenRouter HTTP 502/);
  const log = logs.mock.calls[0].arguments[1] as unknown as Record<string, unknown>;
  assert.equal(log.status, 502);
  assert.equal(log.model, options.model);
  assert.equal(log.requestId, "diagnostic-id");
  assert.match(log.message as string, /Provider failed/);
  assert.doesNotMatch(JSON.stringify(log), /test-secret-key|A peaceful forest scene/);
});

test("authentication, credits, model routing, rate limits, and upstream timeouts have distinct actionable errors", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [status, message] of [
    [401, /API key or account permissions/],
    [403, /API key or account permissions/],
    [402, /needs credits/],
    [400, /configured image model/],
    [404, /configured image model/],
    [429, /too many requests/],
    [504, /provider timed out/],
  ] as const) {
    const transport: typeof fetch = async () => Response.json({ error: {} }, { status });
    await assert.rejects(requestOpenRouterImage(options, transport), message);
  }
});

test("HTML gateway errors are reported as provider failures rather than JSON parsing failures", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  const transport: typeof fetch = async () =>
    new Response("<html>Gateway timeout</html>", { status: 504 });
  await assert.rejects(requestOpenRouterImage(options, transport), /provider timed out/);
  assert.equal((logs.mock.calls[0].arguments[1] as unknown as { status: number }).status, 504);
});

test("content-policy errors are distinguished from credentials and model failures without exposing flagged input", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  for (const error of [
    { code: "content_policy_violation", message: "Request declined" },
    { code: 403, metadata: { error_type: "content_policy_violation" } },
    { code: 403, metadata: { error_type: "refusal" } },
    { code: 400, metadata: { provider_code: "moderation_blocked" } },
    {
      code: 502,
      message: "Provider returned error",
      metadata: {
        raw: JSON.stringify({
          error: { code: "moderation_blocked", message: `Policy declined ${options.apiKey}` },
        }),
      },
    },
    {
      code: 403,
      metadata: { reasons: ["content policy"], flagged_input: "private flagged prompt segment" },
    },
  ]) {
    const transport: typeof fetch = async () => Response.json({ error }, { status: 403 });
    await assert.rejects(
      requestOpenRouterImage(options, transport),
      (failure: unknown) =>
        failure instanceof OpenRouterImageError &&
        failure.status === 403 &&
        /declined this prompt under its content policy/.test(failure.message),
    );
  }
  const output = JSON.stringify(logs.mock.calls);
  assert.doesNotMatch(output, /test-secret-key|private flagged prompt segment/);
  assert.match(output, /moderation_blocked/);
});

test("error envelopes in HTTP 200 responses retain their provider reason instead of becoming missing-image errors", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [body, message] of [
    [{ error: { code: 504, message: "Upstream timed out" } }, /provider timed out/],
    [
      { error: { code: "image_content_policy_violation" }, error_type: "content_policy_violation" },
      /declined this prompt under its content policy/,
    ],
  ] as const) {
    await assert.rejects(
      requestOpenRouterImage(options, async () => Response.json(body)),
      message,
    );
  }
});

test("connection failures and timeouts before or during the response body are identified separately", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  const unreachable: typeof fetch = async () => {
    throw new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
  };
  await assert.rejects(requestOpenRouterImage(options, unreachable), /couldn’t reach OpenRouter/);
  assert.equal(
    (logs.mock.calls[0].arguments[1] as unknown as { code: string }).code,
    "ECONNREFUSED",
  );
  const timedOut: typeof fetch = async () => {
    throw new DOMException("Timed out", "TimeoutError");
  };
  await assert.rejects(
    requestOpenRouterImage(options, timedOut),
    (error: unknown) => error instanceof OpenRouterImageError && error.status === 504,
  );
  const interruptedBody: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        start: (controller) => controller.error(new DOMException("Aborted", "AbortError")),
      }),
    );
  await assert.rejects(requestOpenRouterImage(options, interruptedBody), /took too long/);
});

test("empty images, unsupported formats, and unreadable successful responses fail without logging image data", async (t) => {
  const logs = t.mock.method(console, "error", () => {});
  for (const body of [
    null,
    { data: [] },
    { data: [{ b64_json: "", media_type: "image/png" }] },
    { data: [{ b64_json: "private-image-data", media_type: "image/svg+xml" }] },
  ]) {
    await assert.rejects(
      requestOpenRouterImage(options, async () => Response.json(body)),
      /didn’t return a supported image/,
    );
  }
  await assert.rejects(
    requestOpenRouterImage(options, async () => new Response("<html>Not JSON</html>")),
    /unreadable response/,
  );
  assert.doesNotMatch(JSON.stringify(logs.mock.calls), /private-image-data/);
});
