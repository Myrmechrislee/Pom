type ImageRequest = {
  apiKey: string;
  model: string;
  prompt: string;
  referer: string;
};

type ProviderFailure = {
  code?: unknown;
  message?: unknown;
  error_type?: unknown;
  metadata?: {
    error_type?: unknown;
    provider_code?: unknown;
    raw?: unknown;
    reasons?: unknown;
    flagged_input?: unknown;
  };
};

function providerFailureDetails(error?: ProviderFailure, errorType?: unknown) {
  let upstream: ProviderFailure | undefined;
  if (typeof error?.metadata?.raw === "string") {
    try {
      upstream = JSON.parse(error.metadata.raw)?.error;
    } catch {
      // Some providers return plain text rather than a JSON error envelope.
    }
  }
  const policyCodes = new Set([
    "content_policy_violation",
    "image_content_policy_violation",
    "moderation_blocked",
    "refusal",
  ]);
  const blocked =
    [
      errorType,
      error?.error_type,
      error?.code,
      error?.metadata?.error_type,
      error?.metadata?.provider_code,
      upstream?.code,
      upstream?.error_type,
    ].some((value) => typeof value === "string" && policyCodes.has(value)) ||
    (typeof error?.metadata?.flagged_input === "string" &&
      Array.isArray(error.metadata.reasons) &&
      error.metadata.reasons.length > 0);
  return { blocked, upstream };
}

export class OpenRouterImageError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

function failureMessage(status: number, blocked = false) {
  if (blocked)
    return "The image provider declined this prompt under its content policy. Please revise the scene description.";
  if (status === 402) return "Your OpenRouter account needs credits to generate an image.";
  if (status === 401 || status === 403)
    return "OpenRouter rejected the server’s API key or account permissions. Check the production OpenRouter settings.";
  if (status === 400 || status === 404 || status === 422)
    return "OpenRouter couldn’t use the configured image model or settings. Check the production image model.";
  if (status === 408 || status === 504)
    return "The image provider timed out. Please try generating your scene again.";
  if (status === 429)
    return "The image provider is receiving too many requests. Please wait a moment and try again.";
  return `The image provider couldn’t complete your scene (OpenRouter HTTP ${status}). Please try again.`;
}

export async function requestOpenRouterImage(
  options: ImageRequest,
  transport: typeof fetch = fetch,
): Promise<{ b64_json: string; media_type?: string }> {
  const started = Date.now();
  const safeMessage = (value: unknown) =>
    typeof value === "string"
      ? value
          .replaceAll(options.apiKey, "[redacted]")
          .replaceAll(options.prompt, "[redacted prompt]")
          .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
          .slice(0, 1000)
      : undefined;
  const report = (detail: Record<string, unknown>) =>
    console.error("Pom image generation failed", {
      model: options.model,
      elapsedMs: Date.now() - started,
      ...detail,
    });

  let response: Response;
  try {
    response = await transport("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": options.referer,
        "X-Title": "Pom",
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        aspect_ratio: "16:9",
        n: 1,
      }),
      signal: AbortSignal.timeout(165000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
    report({
      type: timedOut ? "timeout" : "network",
      message: safeMessage(error instanceof Error ? error.message : undefined),
      cause: safeMessage(cause?.message),
      code: safeMessage(cause && "code" in cause ? cause.code : undefined),
    });
    throw new OpenRouterImageError(
      timedOut
        ? "Image generation took too long. Please try generating your scene again."
        : "The server couldn’t reach OpenRouter. Please try again.",
      timedOut ? 504 : 502,
    );
  }

  const requestId = response.headers.get("x-request-id");
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (!response.ok) {
      report({ type: "provider", status: response.status, requestId });
      throw new OpenRouterImageError(failureMessage(response.status));
    }
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    report({ type: timedOut ? "timeout" : "invalid-response", status: response.status, requestId });
    throw new OpenRouterImageError(
      timedOut
        ? "Image generation took too long. Please try generating your scene again."
        : "The image provider returned an unreadable response. Please try again.",
      timedOut ? 504 : 502,
    );
  }
  if (!response.ok || result?.error) {
    const error: ProviderFailure | undefined = result?.error;
    const { blocked, upstream } = providerFailureDetails(error, result?.error_type);
    report({
      type: "provider",
      status: response.status,
      requestId,
      code: typeof error?.code === "number" ? error.code : safeMessage(error?.code),
      message: safeMessage(error?.message),
      errorType: safeMessage(
        error?.metadata?.error_type ?? error?.error_type ?? result?.error_type,
      ),
      providerCode: safeMessage(error?.metadata?.provider_code ?? upstream?.code),
      providerMessage: safeMessage(upstream?.message),
      policyBlocked: blocked,
    });
    const status = response.ok
      ? typeof error?.code === "number" && error.code >= 400 && error.code <= 599
        ? error.code
        : 502
      : response.status;
    throw new OpenRouterImageError(failureMessage(status, blocked), blocked ? 403 : 502);
  }
  const image = result?.data?.[0];
  if (
    typeof image?.b64_json !== "string" ||
    !image.b64_json ||
    !/^image\/(png|jpeg|webp)$/.test(image.media_type || "image/png")
  ) {
    report({ type: "missing-image", status: response.status, requestId });
    throw new OpenRouterImageError("The image provider didn’t return a supported image.");
  }
  return image;
}
