import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const getAppBaseUrl = () => process.env.APP_BASE_URL || "http://localhost:3000";

export const authConfigured = () =>
  ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET"].every((key) =>
    Boolean(process.env[key]),
  );
let client: Auth0Client | undefined;
export function getAuth0() {
  if (!authConfigured()) return null;
  return (client ??= new Auth0Client({
    appBaseUrl: getAppBaseUrl(),
    authorizationParameters: { scope: "openid profile email" },
  }));
}
