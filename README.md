# PH Healthcare — Backend

REST API for same-day doctor visits. A patient books a published schedule, pays the consultation fee with bKash, and receives a 20-minute serial. A doctor publishes hours and writes the prescription. Admins and super admins approve doctors and manage accounts.

[![Live API](https://img.shields.io/badge/API-ph--healthcare--api.vercel.app-6cc644)](https://ph-healthcare-api.vercel.app)
[![Live site](https://img.shields.io/badge/Site-ph--healthcare--six.vercel.app-4c8bf5)](https://ph-healthcare-six.vercel.app)

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · Redis · JWT cookies · bKash

This folder is the API only. The product walkthrough, role diagrams, and screen map are in the frontend README: [`../PH Healthcare Management System Frontend/README.md`](../PH%20Healthcare%20Management%20System%20Frontend/README.md).

Every route is listed in [`../PH Healthcare Management System Frontend/Note/API-Endpoints.md`](../PH%20Healthcare%20Management%20System%20Frontend/Note/API-Endpoints.md). The product rules are in [`../PH Healthcare Management System Frontend/Note/Project Requirements.md`](../PH%20Healthcare%20Management%20System%20Frontend/Note/Project%20Requirements.md).

Base URL locally: `http://localhost:5000`. Live base URL: `https://ph-healthcare-api.vercel.app`. Feature routes use the prefix `/api/v1`.

## Prerequisites

| Tool           | Version | Check with |
| -------------- | ------- | ---------- |
| **Node.js**    | 20+     | `node -v`  |
| **PostgreSQL** | 14+     | `psql -V`  |

Any package manager works (npm, pnpm, yarn, bun). The examples below use `npm`.

## Getting started

**1. Install dependencies**

```bash
npm install
```

**2. Set up your environment file**

```bash
cp .env.example .env
```

Open `.env` and point `DATABASE_URL` at a Postgres database you can connect to:

```
DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/ph_healthcare?schema=public"
```

The database doesn't need to exist beforehand — `prisma migrate dev` creates it. The other variables in `.env.example` are fine to leave as-is for local development; see [Environment variables](#environment-variables) for what each one does.

**3. Generate the Prisma client**

```bash
npx prisma generate
```

Prisma writes a typed client into `src/generated/prisma`. That folder is git-ignored, so a fresh clone never has it, and almost every file under `src/` imports from it — skip this step and nothing compiles. Re-run it any time you change a file in `prisma/schema/`.

**4. Run the migrations**

```bash
npx prisma migrate dev
```

This applies the SQL already committed under `prisma/migrations/`. The schema covers users, patients, doctors, admins, schedules, appointments, payments, and prescriptions.

**5. Start the server**

```bash
npm run dev
```

You should see:

```
Connected to the database successfully.
Server is running on port 5000
```

Confirm it's up:

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to PH Healthcare System Backend"}
```

## Environment variables

`src/app/config/index.ts` is the only place `process.env` is read — application code should import `config` from there rather than reaching for `process.env` directly.

| Variable                  | What it's for                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                 | `development` includes the raw error and stack trace in API error responses |
| `PORT`                     | Port the HTTP server listens on                                    |
| `DATABASE_URL`             | Postgres connection string, used by both Prisma and the app        |
| `JWT_ACCESS_SECRET`        | Signing key for access tokens                                      |
| `JWT_REFRESH_SECRET`       | Signing key for refresh tokens                                     |
| `JWT_ACCESS_EXPIRES_IN`    | Access token lifetime (e.g. `15m`, `1d`)                            |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh token lifetime                                              |
| `BCRYPT_SALT_ROUNDS`       | Read into config but not wired up yet — password hashing currently uses a hardcoded value (see below) |
| `BACKEND_URL`              | Read into config but not used anywhere yet                          |
| `FRONTEND_URL`             | Added to the CORS allowlist                                        |

There's no validation on startup: if a variable is missing, `config` simply holds `undefined` for it, and the app boots anyway. The first sign of trouble is usually a runtime error the moment that value is actually used — for `JWT_ACCESS_SECRET`, that means the very first login or registration.

Before deploying anywhere, replace the JWT secrets — the ones in `.env.example` are placeholders anyone can guess:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Project structure

```
src/
├── server.ts                       # connects to the DB, then starts listening
├── app.ts                          # express app: cors, body parsing, routes, error handling
├── generated/prisma/                # Prisma client — git-ignored, run `npx prisma generate`
└── app/
    ├── config/index.ts              # reads and exposes every environment variable
    ├── lib/prisma.ts                # shared PrismaClient instance — always import this, don't `new` your own
    ├── middleware/
    │   ├── checkAuth.ts             # exports `auth(...roles)`, the JWT + role guard
    │   ├── globalErrorHandler.ts    # turns thrown errors into JSON responses
    │   └── notFound.ts              # catch-all for unmatched routes
    ├── utils/
    │   ├── catchAsync.ts            # wraps async route handlers so thrown errors reach the error handler
    │   ├── jwt.ts                   # sign / verify helpers
    │   └── sendResponse.ts          # the standard `{ success, statusCode, message, data }` envelope
    └── module/
        ├── auth/
        ├── user/
        ├── doctor/
        ├── shedule/
        ├── appointment/
        ├── prescription/
        ├── payment/
        └── contact/

prisma/
├── schema/
│   ├── schema.prisma                # generator + datasource only
│   ├── user.prisma
│   ├── patient.prisma
│   └── enums.prisma                 # Role, UserStatus, Gender
└── migrations/                      # generated SQL, committed to git
```

Prisma's schema is split across multiple files, wired together by `prisma.config.ts` at the repo root. That file also loads `.env` so the Prisma CLI can see `DATABASE_URL`.

**The data model:** every account is one `User`, linked to one profile for its role: patient, doctor, or admin. A doctor owns schedules. A patient books an appointment on a schedule, pays it, and can receive one prescription after the visit is completed.

## The API

| Area | Prefix | Examples |
| --- | --- | --- |
| Auth | `/api/v1/auth` | register, verify email, login, Google, forgot and reset password, change password, logout |
| Users | `/api/v1/user` | create admin, create super admin, block or unblock, list patients and admins |
| Doctors | `/api/v1/doctor` | apply, verify email, approve, list, update profile |
| Schedules | `/api/v1/schedule` | create, publish, today's open schedules |
| Appointments | `/api/v1/appointment` | book, pay, bKash callback, cancel, update status |
| Prescriptions | `/api/v1/prescription` | create after the visit is completed, read by appointment |
| Payments | `/api/v1/payment` | the patient's payments, or every payment for an admin |
| Contact | `/api/v1/contact` | clinic inbox message. This is not a booking |

`GET /` returns a welcome message. The full method, role, and body list is in [`API-Endpoints.md`](../PH%20Healthcare%20Management%20System%20Frontend/Note/API-Endpoints.md).

A successful JSON response has this shape:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": {} }
```

Login and registration set an access token and a refresh token as httpOnly cookies. The frontend sends those cookies with `credentials: "include"`. `GET /api/v1/auth/me` returns the signed-in user.

## Roles and authentication

Four roles exist: `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, and `PATIENT`.

Public registration always creates a patient. A doctor joins through `POST /api/v1/doctor/apply-as-doctor` and cannot use the platform until an admin approves them. Admins and super admins are created by an existing manager. Google login is patient-only.

`auth(...roles)`, exported from `checkAuth.ts`, is the route guard:

```ts
router.get('/me', auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN), AuthController.getMe)
```

What it actually does, in order:

1. Reads the token from the `accessToken` cookie, falling back to the `Authorization` header.
2. Verifies the JWT signature.
3. Checks the role **from the token payload** against the roles the route allows.
4. Looks the user up in the database by matching `id`, `email`, `name`, *and* `role` all at once — if any of those four have changed since the token was issued, the lookup fails and the request is rejected, even though the account still exists.
5. Rejects the request only if the user's `status` is exactly `BLOCKED`. It does **not** check `isDeleted` or a `DELETED` status, so a soft-deleted account can still authenticate as long as `status` wasn't also set to `BLOCKED`.

Request bodies are checked with Zod on the routes that accept one. A password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.

## Extending a module

New features go under `src/app/module/<name>/` as four files with strict responsibilities:

| File                   | Responsibility                                                    |
| ---------------------- | ------------------------------------------------------------------- |
| `<name>.route.ts`      | Wires `auth(...roles)` to controller functions, exports `<Name>Routes` |
| `<name>.controller.ts` | Reads `req.body` / `req.user`, calls the service, calls `sendResponse` |
| `<name>.service.ts`    | All business logic and every Prisma call for the module              |
| `<name>.interface.ts`  | The TypeScript types for the module's payloads                       |

Then mount it in `app.ts` next to the existing line:

```ts
app.use('/api/v1/doctor', DoctorRoutes)
```

Two rules keep the module boundaries useful rather than decorative:

- **Controllers never call Prisma directly**, and **services never touch `req` or `res`.** If a service needs to know who's calling it, pass it the small `{ userId, email, name, role }` shape, not the whole request.
- **Never spread `req.body` straight into a Prisma `create`/`update`.** Destructure the exact fields you expect. Zod rejects a bad body, and this destructuring keeps a field like `role` from being written just because a client sent it.

## Scripts

```bash
npm run dev       # tsx watch ./src/server.ts
npm run build     # prisma generate, then bundle with tsup
npm run start     # node dist/server.js
npm run typecheck # tsc --noEmit
```

There's no `npm run generate` / `migrate` / `studio` wrapper — call Prisma's CLI directly:

```bash
npx prisma generate     # regenerate the client after editing prisma/schema/
npx prisma migrate dev  # create + apply a migration
npx prisma studio       # browser GUI for your data, at http://localhost:5555
```

## Troubleshooting

**`Cannot find module '.../src/generated/prisma/client'`**
Run `npx prisma generate` — see step 3 of [Getting started](#getting-started).

**`Can't reach database server` / `ECONNREFUSED`**
Postgres isn't running, or `DATABASE_URL` points somewhere it can't reach. Confirm with `pg_isready -h localhost -p 5432`.

**`P1010: User was denied access on the database`**
The username or password in `DATABASE_URL` doesn't match a real role on your Postgres server. `psql -c '\du'` lists the roles that actually exist; `whoami` gives you your OS username, which is usually your local superuser with no password.

**Login or register throws instead of returning a token**
Check that `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are actually set in your `.env` — `jsonwebtoken` throws if the signing secret is `undefined`, and this project doesn't validate environment variables on startup.
