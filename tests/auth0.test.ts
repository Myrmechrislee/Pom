import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { getAuth0 } from "../lib/auth0";
import { proxy } from "../proxy";

const environment = {
  APP_BASE_URL: "http://localhost:3000",
  AUTH0_DOMAIN: "auth.example.com",
  AUTH0_CLIENT_ID: "test-client",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: "a".repeat(64),
};
const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));

before(() => {
  Object.assign(process.env, environment);
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.equal(String(input), "https://auth.example.com/.well-known/openid-configuration");
    return Response.json({
      issuer: "https://auth.example.com/",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/oauth/token",
      jwks_uri: "https://auth.example.com/.well-known/jwks.json",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
  });
});

after(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("OAuth entry points move to the callback origin before setting cookies", async () => {
  for (const path of ["/auth/login", "/auth/logout", "/api/todoist/connect"]) {
    const request = new NextRequest(`http://127.0.0.1:3000${path}?returnTo=%2F%3Ftab%3Dtasks`, {
      headers: { host: "127.0.0.1:3000" },
    });
    // Reproduce Next.js's normalization, which hides the browser's actual hostname.
    assert.equal(request.nextUrl.hostname, "localhost");
    const response = await proxy(request);
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      `http://localhost:3000${path}?returnTo=%2F%3Ftab%3Dtasks`,
    );
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("forwarded public origin avoids redirect loops behind an HTTPS reverse proxy", async (t) => {
  process.env.APP_BASE_URL = "https://pom.example.com";
  t.after(() => {
    process.env.APP_BASE_URL = environment.APP_BASE_URL;
  });
  const response = await proxy(
    new NextRequest("http://internal:3000/auth/login?screen_hint=signup", {
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "preview.example.com, internal:3000",
        "x-forwarded-proto": "https, http",
      },
    }),
  );
  assert.equal(
    response.headers.get("location"),
    "https://pom.example.com/auth/login?screen_hint=signup",
  );
  assert.equal(response.headers.get("set-cookie"), null);
  let called = false;
  t.mock.method(getAuth0()!, "middleware", async () => {
    called = true;
    return NextResponse.next();
  });
  const canonical = await proxy(
    new NextRequest("http://internal:3000/auth/login", {
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "pom.example.com, internal:3000",
        "x-forwarded-proto": "https, http",
      },
    }),
  );
  assert.equal(called, true);
  assert.equal(canonical.headers.get("location"), null);
});

test("canonical login creates a cookie that the callback validates, while invalid state is rejected", async () => {
  const login = await proxy(
    new NextRequest("http://localhost:3000/auth/login", {
      headers: { host: "localhost:3000" },
    }),
  );
  const authorize = new URL(login.headers.get("location")!);
  assert.equal(authorize.origin, "https://auth.example.com");
  assert.equal(authorize.searchParams.get("redirect_uri"), "http://localhost:3000/auth/callback");
  const state = authorize.searchParams.get("state")!;
  const cookie = login.cookies.get(`__txn_${state}`)!;
  assert.ok(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  const callback = new URL(authorize.searchParams.get("redirect_uri")!);
  callback.searchParams.set("state", state);
  // A provider cancellation exercises state validation without signing in a real account.
  callback.searchParams.set("error", "access_denied");
  const response = await proxy(
    new NextRequest(callback, {
      headers: { host: callback.host, cookie: `${cookie.name}=${cookie.value}` },
    }),
  );
  assert.equal(await response.text(), "An error occurred during the authorization flow.");
  assert.equal(response.cookies.get(cookie.name)?.maxAge, 0);

  for (const [callbackState, cookieHeader] of [
    [state, ""],
    ["tampered-state", `${cookie.name}=${cookie.value}`],
    [state, `${cookie.name}=tampered-cookie`],
  ]) {
    callback.searchParams.set("state", callbackState);
    const invalid = await proxy(
      new NextRequest(callback, {
        headers: { host: callback.host, cookie: cookieHeader },
      }),
    );
    assert.equal(invalid.status, 500);
    assert.equal(await invalid.text(), "The state parameter is invalid.");
  }
});
