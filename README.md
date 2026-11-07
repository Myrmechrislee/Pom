# Pom 🌱

A calm, personal Pomodoro workspace built with Next.js, React, TypeScript, Auth0, MongoDB, and OpenRouter.

## Run locally

Use Node.js 22.13+ or Node.js 24 LTS.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. No service credentials are needed to try the guest workspace: timers, tasks, themes, scenery, and activity history are saved on your device. Guest and signed-in workspaces are separate; signing in does not upload a guest’s local data.

## Run with Docker Compose

To run Pom and MongoDB together, use Docker Compose 2.24+:

```sh
docker compose up -d --build
docker compose ps
```

Open **http://localhost:3000**. Compose builds the app with the included Dockerfile, waits for MongoDB to become healthy, and runs both services in the background with automatic restarts. Stop any locally running app on port 3000 before starting the stack.

MongoDB publishes no host port. The app reaches it at `mongo:27017` on this project's Compose network, so other Compose stacks can run their own MongoDB instances without a port conflict.

For signed-in features, create `.env` from `.env.example` if you do not already have one, then add the credentials described below. Compose loads `.env` and then `.env.local` when present; `.env.local` takes precedence. Credentials are passed at runtime and excluded from the image. The app container always connects to the bundled database at `mongodb://mongo:27017/pom`, overriding any host-only `MONGODB_URI` in those files. Keep `APP_BASE_URL=http://localhost:3000` for local OAuth callbacks.

After changing code, run `docker compose up -d --build` again. After changing credentials, run `docker compose up -d`. View app logs with `docker compose logs -f app`. Stop the stack with `docker compose down`; MongoDB data stays in the named `pom-data` volume.

## What’s included

- Focus, short-break, and long-break timers. Defaults: **30 / 5 / 15 minutes**, with a long break after four completed focus sessions. Set durations and the number of sessions before a long break (1–12) directly on the dashboard before starting; All settings opens the remaining preferences.
- Start, pause, resume, reset, skip, optional ambient sound, completion chimes, and optional automatic session starts.
- Starting or resuming a timer opens fullscreen by default, with the selected task and a transparent, scrollable list of unfinished tasks over the scenery. Select a task to focus on it, or check it off without leaving fullscreen; imported task completions also update Todoist, and failed updates stay available to retry. Escape or the close button returns to the workspace. Browsers that restrict fullscreen use the full-window focus layout, including when recovering a running timer after reload.
- An animated ring shows time remaining by default. Settings offer a progress bar, no indicator, animation control, and automatic fullscreen control; choices persist with your workspace. Reduced-motion preferences disable animation.
- Timestamp-based timer recovery across reloads and background tabs. Paused time is excluded. Resetting, skipping, or changing modes records the focus time already spent.
- Five persistent palettes: Sage, Oat milk, Rose, Lavender, and After hours.
- Four bundled scenic backgrounds, image imports, and prompt-based AI scene generation. Selecting or creating an image returns to the timer. Editing an AI scene's prompt adds a version to the same saved scene. Use its version picker to restore any previous image and prompt; your selection persists across reloads.
- A task list grouped by due date and category, with a Due today filter, local tasks, task selection for focus, completion and reopening, and selective Todoist OAuth import/sync.
- A personal profile with daily, weekly, and monthly charts for focused minutes and task completions, session history, a daily intention, and a streak.
- Responsive desktop and mobile layouts, keyboard-accessible dialogs, reduced-motion support, and honest empty states.

## Connect the services

All credentials stay on the server. Set them in `.env.local` for development or your host’s secret manager for production. Restart the server after changes.

### Auth0

Create an Auth0 **Regular Web Application**. Set:

```dotenv
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=your-random-64-character-hex-secret
```

Generate `AUTH0_SECRET` with `openssl rand -hex 32`. Add these URLs in the Auth0 application settings:

| Auth0 setting         | Local value                           |
| --------------------- | ------------------------------------- |
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs   | `http://localhost:3000`               |
| Allowed Web Origins   | `http://localhost:3000`               |

The Auth0 v4 SDK handles `/auth/login`, `/auth/callback`, and `/auth/logout` through Next.js’s `proxy.ts`. Every private API independently checks the server session.

Sign-in, sign-out, and Todoist connection requests first move to the exact origin in `APP_BASE_URL`. This keeps OAuth cookies on the same hostname as their callbacks, including when you open the local app at `127.0.0.1:3000`. If an older login attempt shows “The state parameter is invalid,” open `http://localhost:3000` and start sign-in again; reloading the old callback cannot restore its missing cookie.

### MongoDB

Use MongoDB Atlas or a local MongoDB instance:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/pom
MONGODB_DB=pom
```

For local Node.js development with only the database in Docker:

```sh
docker compose -f compose.yaml -f compose.local.yaml up -d mongo
```

The opt-in `compose.local.yaml` override publishes MongoDB on `127.0.0.1:27017`. If that host port is already in use, prefix the command with `MONGO_PORT=27018` and set your local `MONGODB_URI` to `mongodb://127.0.0.1:27018/pom`.

This command starts only the database. Start Pom separately with `npm run dev` and keep that terminal running while signing in or connecting Todoist. To run both services in Docker, use `docker compose up -d --build` instead. Open `http://localhost:3000`; all OAuth callbacks return to that origin. If the browser says localhost refused the connection, check that the app server is still running on port 3000.

When Pom runs directly on your Mac, the database host is `127.0.0.1`. The hostname `mongo` is for an application container on the same Compose network.

The local Compose configuration includes a `GLIBC_TUNABLES=glibc.pthread.rseq=1` compatibility workaround for MongoDB’s allocator on affected Docker Desktop kernels, plus a database health check. See [the MongoDB Docker issue](https://github.com/docker-library/mongo/issues/765) and [MongoDB’s kernel compatibility notes](https://www.mongodb.com/docs/manual/release-notes/8.0/). Check database readiness with `docker compose ps`.

For Atlas, create a database user, allow your application server’s network address, and use your Atlas connection string. Collections are created automatically: `profiles`, `tasks`, `completions`, `sessions`, `backgrounds`, `backgroundVersions`, `connections`, `oauthStates`, and `generationLimits`.

Every record is scoped to the Auth0 user ID. Session and completion IDs are idempotent. Signed-in focus sessions that temporarily fail to sync are queued on the same device and retried on the next launch.

### OpenRouter

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
```

Use an image-output model supported by OpenRouter’s dedicated `POST /api/v1/images` endpoint. The model is configurable; availability and credit requirements depend on your OpenRouter account. The server requests a landscape scene, converts the returned image to WebP, and saves the bytes directly to the user’s MongoDB library. Background URLs are authenticated and private, so provider URLs cannot expire out of the library.

Browsers cache bundled scenes for one day and saved images privately for up to one year, reusing downloaded images across visits. Each saved image version has its own URL, so generating a revision shows the new image immediately. Guest imports are already stored on the device.

Generation requires a signed-in user, MongoDB, and an OpenRouter key. The app limits each user to five requests per hour and 50 saved backgrounds. Revisions stay within their original background and do not use additional library slots; generating a revision still counts toward the hourly limit. Generated images are resized to a maximum width of 1920 pixels and capped at 8 MB after conversion.

To use your own photo, open **Backgrounds → Import image**. JPG, PNG, WebP, and GIF files up to 8 MB and 40 megapixels are supported; animated images are saved as still backgrounds. Imports are resized to fit within 1920 × 1920 pixels and applied automatically. Guest imports stay in browser storage on this device, subject to available space. Signed-in imports are converted to WebP and saved privately in MongoDB alongside generated scenes. Imports do not require OpenRouter credits and share the 50-background library limit.

### Todoist

Create an application in Todoist’s developer console. Register this redirect URI:

```text
http://localhost:3000/api/todoist/callback
```

Set:

```dotenv
TODOIST_CLIENT_ID=your-todoist-client-id
TODOIST_CLIENT_SECRET=your-todoist-client-secret
TOKEN_ENCRYPTION_KEY=your-separate-random-64-character-hex-key
```

Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32`. Keep it stable: replacing it makes previously stored Todoist tokens unreadable, requiring reconnection.

Sign in to Pom, open **Settings → Todoist → Connect**, authorize the account, and select **Sync Todoist**. Pom uses Todoist API v1 with pagination and the `data:read_write` scope. Access and refresh tokens are encrypted with AES-256-GCM before storage. Expiring access tokens are refreshed automatically before use, with rotated refresh tokens saved back to MongoDB. OAuth state is single-use, expires after 10 minutes, and is checked against an HTTP-only cookie and the initiating user.

Sync opens a task chooser grouped by due date and Todoist project (category). Tasks due today in the viewer’s local calendar are selected by default; change the checkboxes and confirm Import to bring in only those tasks. Opening or cancelling the chooser does not import anything. Existing tasks stay in Pom when left unchecked. A confirmed import also reconciles the last 89 days of completion history for tasks already imported, without bringing in unrelated completed tasks. Completing or reopening an imported task in Pom updates Todoist. Sync is manual. Recurring tasks retain completion events even when the task becomes active again. Deleting a local task preserves its completion history; explicitly reopening it reverses its latest completion. Tasks added inside Pom are local Pom tasks.

## Activity behavior

Charts use the viewer’s local timezone. Focus is recorded when a session finishes, is reset, is skipped, or changes mode. An in-progress session is displayed in the timer and enters the charts when recorded. Sessions spanning chart boundaries distribute their recorded focus in proportion to the session’s wall-clock interval, excluding paused time from the total. There are no seeded statistics or fabricated Todoist tasks.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite covers timer defaults, task persistence and completion, configurable durations, pause timing, partial sessions, refresh recovery, long breaks, palettes, scenery, mobile layouts, authenticated API boundaries, and the signed-in Todoist/image-generation UI. Signed-in service responses in the UI test are mocked; real Auth0, MongoDB, OpenRouter billing/generation, and Todoist OAuth require your credentials for a live end-to-end check.

To use an already installed Chrome for browser tests, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.
If another Pom instance is running on port 3000, set `POM_E2E_PORT=3001` to test the current source on a separate port.

## Production

Deploy to a Node.js host with network access to MongoDB and the external APIs. This app uses the native MongoDB driver and image processing, and requires a Node server rather than a static-only host.

```sh
npm run build
npm start
```

Alternatively, build the included Dockerfile and provide runtime secrets to the container. Set `APP_BASE_URL` to the exact public HTTPS origin and register that origin’s Auth0 and Todoist callback URLs. `npm start` binds to loopback for local use; the Docker standalone server binds to `0.0.0.0:3000` for hosting.

### Deploy to Contabo with GitHub Actions

The workflow in `.github/workflows/deploy.yml` deploys on pushes to `main` and can also be started from GitHub’s **Actions → Deploy to Contabo → Run workflow**. It connects to the Ubuntu server over SSH and runs:

```sh
cd "$HOME/Pom"
git pull --ff-only
docker compose up -d --build app
```

`--build` rebuilds the app image with the pulled code before starting it. Deployments run one at a time.

In the repository’s **Settings → Secrets and variables → Actions**, add these repository secrets:

| Secret            | Value                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `CONTABO_HOST`    | Server IP address or hostname.                                                                                         |
| `CONTABO_USER`    | SSH username.                                                                                                          |
| `CONTABO_SSH_KEY` | Full private SSH key, without a passphrase, whose public key is in that user’s `~/.ssh/authorized_keys` on the server. |
| `CONTABO_PORT`    | Optional SSH port; defaults to `22`.                                                                                   |

No known-hosts secret or variable is required. SSH uses `StrictHostKeyChecking=accept-new` with a temporary known-hosts file, automatically accepting the server's host key for each deployment. Host keys are not pinned between workflow runs.

The SSH user must already have the repository cloned at `~/Pom`, with `main` checked out and tracking `origin/main`, and be able to run `git pull` and `docker compose` without interactive prompts or `sudo`. Install Docker with Compose 2.24+ and configure the server’s `.env` first. For a private repository, configure GitHub read access on the server as well; the workflow’s SSH key authenticates to Contabo. The app’s published port is loopback-only, so configure your reverse proxy to reach `127.0.0.1:3000`.

## References and assets

- [Auth0 Next.js SDK](https://auth0.github.io/nextjs-auth0/)
- [Todoist API v1](https://developer.todoist.com/api/v1/)
- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- Scenic photos from [Unsplash](https://unsplash.com): [forest](https://images.unsplash.com/photo-1448375240586-882707db888b), [ocean](https://images.unsplash.com/photo-1475924156734-496f6cac6ec1), [mountains](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b), [dunes](https://images.unsplash.com/photo-1509316785289-025f5b846b35).
- DM Sans and Manrope are bundled locally under the SIL Open Font License; see `public/fonts/`.
