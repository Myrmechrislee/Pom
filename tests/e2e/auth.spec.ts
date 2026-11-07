import { test, expect, type Request } from "@playwright/test";

test("login from the loopback IP sends its state cookie to the callback hostname", async ({
  page,
  request,
  baseURL,
}) => {
  const services = await request.get("/api/me");
  test.skip(!(await services.json()).services.auth, "Auth0 is not configured");
  const redirect = await request.get(new URL("/auth/login", baseURL).href, { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  const canonicalLogin = new URL(redirect.headers().location);
  expect(canonicalLogin.pathname).toBe("/auth/login");
  expect(canonicalLogin.hostname).toBe("localhost");
  expect(redirect.headers()["set-cookie"]).toBeUndefined();
  let authorization: URL | undefined;
  let callbackRequest: Request | undefined;
  page.on("request", (outgoing) => {
    if (new URL(outgoing.url()).pathname === "/auth/callback") callbackRequest = outgoing;
  });
  await page.route(canonicalLogin.href, async (route) => {
    const login = await route.fetch({ maxRedirects: 0 });
    authorization = new URL(login.headers().location);
    const callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", authorization.searchParams.get("state")!);
    // Preserve the real login cookie and simulate a provider cancellation.
    callback.searchParams.set("error", "access_denied");
    await route.fulfill({
      response: login,
      headers: { ...login.headers(), location: callback.href },
    });
  });
  await page.goto(canonicalLogin.href);
  await expect(page.locator("body")).toHaveText("An error occurred during the authorization flow.");
  expect(authorization).toBeDefined();
  expect(callbackRequest).toBeDefined();
  const headers = await callbackRequest!.allHeaders();
  expect(headers.cookie).toContain(`__txn_${authorization!.searchParams.get("state")}=`);
  expect(new URL(page.url()).origin).toBe(
    new URL(authorization!.searchParams.get("redirect_uri")!).origin,
  );
});
