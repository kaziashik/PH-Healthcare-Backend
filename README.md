# PH Healthcare — Backend

REST API for same-day doctor visits. A patient books a published schedule, pays the consultation fee with **bKash**, and receives a 20-minute serial. A doctor publishes hours and writes the prescription. Admins and super admins approve doctors and manage accounts.

[![Live API](https://img.shields.io/badge/API-ph--healthcare--api.vercel.app-6cc644)](https://ph-healthcare-api.vercel.app)
[![Live site](https://img.shields.io/badge/Site-ph--healthcare--six.vercel.app-4c8bf5)](https://ph-healthcare-six.vercel.app)

| Resource | Link |
|---|---|
| **Live Frontend** | [https://ph-healthcare-six.vercel.app](https://ph-healthcare-six.vercel.app) |
| **Backend API** | [https://ph-healthcare-api.vercel.app](https://ph-healthcare-api.vercel.app) |
| **Frontend Code** | [github.com/kaziashik/PH-Healthcare-Management-System-Frontend](https://github.com/kaziashik/PH-Healthcare-Management-System-Frontend) |
| **Backend Code** | [github.com/kaziashik/PH-Healthcare-Backend](https://github.com/kaziashik/PH-Healthcare-Backend) |
| **API Documentation** | [`resources/docs/PH_Healthcare_API_Design_Documentation.md`](./resources/docs/PH_Healthcare_API_Design_Documentation.md) |
| **API Routes (quick list)** | [`API-Routes.md`](./API-Routes.md) |
| **Postman Collection** | [`resources/postman/PH Healthcare API.postman_collection.json`](./resources/postman/PH%20Healthcare%20API.postman_collection.json) |
| **Database Diagram (drawSQL)** | [drawsql.app/teams/kazi-ashikur/diagrams/ph-healthcare-system-erd](https://drawsql.app/teams/kazi-ashikur/diagrams/ph-healthcare-system-erd) |
| **SQL relations (markdown)** | [`resources/docs/PH_Healthcare_SQL_Relations.md`](./resources/docs/PH_Healthcare_SQL_Relations.md) |
| **Frontend README** | [Frontend walkthrough](https://github.com/kaziashik/PH-Healthcare-Management-System-Frontend) |

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · Redis · JWT cookies · Zod · bKash · Cloudinary · Nodemailer · node-cron

**Base URL**

| Environment | URL |
| --- | --- |
| Local | `http://localhost:5000` |
| Live | `https://ph-healthcare-api.vercel.app` |

Feature routes use the prefix `/api/v1`.

---

## Table of contents

1. [What this API does](#1-what-this-api-does)
2. [One-look system flow](#2-one-look-system-flow)
3. [Sequence diagram](#3-sequence-diagram)
4. [Appointment status](#4-appointment-status)
5. [Roles and auth](#5-roles-and-auth)
6. [API map](#6-api-map)
7. [Project structure](#7-project-structure)
8. [Prerequisites](#8-prerequisites)
9. [Setup guide](#9-setup-guide)
10. [Environment variables](#10-environment-variables)
11. [Scripts](#11-scripts)
12. [Response format](#12-response-format)
13. [Cron jobs](#13-cron-jobs)
14. [Deploy](#14-deploy)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What this API does

| Role | What they can do through this API |
| --- | --- |
| **Patient** | Register + email OTP · login · book a published schedule · pay with bKash · cancel · view payments / receipt · read prescription |
| **Doctor** | Apply + email OTP · after approval create / publish schedules · start and complete visits · write prescription |
| **Admin** | Approve or reject doctors · list patients · block / unblock · view appointments and payments |
| **Super admin** | Everything an admin can do · create admins and super admins |

Patients self-register. Doctors apply and wait for approval. Admins are created by staff accounts, not public signup.

---

## 2. One-look system flow

```mermaid
flowchart TD
    A["Visitor / patient opens the site"] --> B["GET /doctor/all-doctors"]
    B --> C["Pick a doctor and open slots"]
    C --> D{"Logged in as PATIENT?"}
    D -- No --> E["POST /auth/register → verify OTP → login"]
    E --> C
    D -- Yes --> F["POST /appointment/book-appointment"]
    F --> G["Appointment = PENDING"]
    G --> H["POST /appointment/pay-appointment"]
    H --> I["bKash checkout page"]
    I --> J["GET payment/callback"]
    J --> K["Appointment = BOOKED + serial"]
    K --> L["Doctor PATCH status → ONGOING"]
    L --> M["Doctor PATCH status → COMPLETED"]
    M --> N["POST /prescription/create-prescription"]
    N --> O["Patient gets prescription email + record"]
```

Cancel rule: more than **1 hour** before the schedule start → refund. From 1 hour before start onward → cancel without refund.

---

## 3. Sequence diagram

```mermaid
sequenceDiagram
    participant P as Patient
    participant D as Doctor
    participant A as Admin
    participant API as Express API
    participant R as Redis
    participant DB as PostgreSQL
    participant BK as bKash
    participant Mail as Email

    D->>API: Apply as doctor (multipart)
    API->>R: Store pending application + OTP
    API->>Mail: Send OTP
    D->>API: Verify email OTP
    API->>DB: Create user + doctor (PENDING)
    A->>API: Approve doctor
    API->>DB: verificationStatus = APPROVED
    API->>Mail: Approval email

    D->>API: Create schedule (DRAFT)
    D->>API: Publish schedule
    API->>DB: status = PUBLISHED

    P->>API: Register
    API->>R: Store pending patient + OTP
    P->>API: Verify email + login
    P->>API: Book schedule
    API->>DB: Appointment PENDING
    P->>API: Pay appointment
    API->>BK: Create payment
    BK-->>P: Checkout URL
    BK->>API: Payment callback
    API->>DB: BOOKED + serialNumber + joiningTime
    API->>Mail: Invoice PDF

    D->>API: ONGOING then COMPLETED
    D->>API: Create prescription
    API->>DB: Save prescription JSON
    API->>Mail: Prescription PDF
```

---

## 4. Appointment status

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> BOOKED: bKash payment succeeds
    PENDING --> CANCELLED: cancel / unpaid hold expires
    BOOKED --> ONGOING: doctor starts visit
    BOOKED --> CANCELLED: cancel
    ONGOING --> COMPLETED: doctor finishes visit
    CANCELLED --> [*]
    COMPLETED --> [*]
```

| Status | Meaning |
| --- | --- |
| `PENDING` | Slot held. Fee not paid yet |
| `BOOKED` | Paid. Serial assigned |
| `ONGOING` | Doctor started the visit |
| `COMPLETED` | Visit finished. Prescription can be written |
| `CANCELLED` | Visit closed |

A schedule is **3–8 hours**, one calendar day, split into **20-minute** slots. It starts as `DRAFT`. Publish locks the date. The first booking locks the time range.

---

## 5. Roles and auth

Auth uses **httpOnly JWT cookies** (`accessToken`, `refreshToken`). The browser client must send `credentials: "include"`.

Route guard: [`src/app/middleware/checkAuth.ts`](./src/app/middleware/checkAuth.ts)

```ts
router.get("/me", auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN), AuthController.getMe);
```

What `auth(...roles)` does:

1. Reads the access token from the cookie (or `Authorization` header)
2. Verifies the JWT
3. Checks the role against the allowed list
4. Loads the user from the database
5. Rejects blocked accounts

Request bodies are validated with Zod via [`validateRequest.ts`](./src/app/middleware/validateRequest.ts).

---

## 6. API map

| Area | Prefix | Module folder |
| --- | --- | --- |
| Auth | `/api/v1/auth` | [`src/app/module/auth`](./src/app/module/auth) |
| Users | `/api/v1/user` | [`src/app/module/user`](./src/app/module/user) |
| Doctors | `/api/v1/doctor` | [`src/app/module/doctor`](./src/app/module/doctor) |
| Schedules | `/api/v1/schedule` | [`src/app/module/shedule`](./src/app/module/shedule) |
| Appointments | `/api/v1/appointment` | [`src/app/module/appointment`](./src/app/module/appointment) |
| Payments | `/api/v1/payment` | [`src/app/module/payment`](./src/app/module/payment) |
| Prescriptions | `/api/v1/prescription` | [`src/app/module/prescription`](./src/app/module/prescription) |
| Contact | `/api/v1/contact` | [`src/app/module/contact`](./src/app/module/contact) |

Root:

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/` | Welcome message |
| GET | `/test` | Welcome + random 6-digit number |

Full method / role / body tables:

- [`API-Routes.md`](./API-Routes.md)
- [`resources/docs/PH_Healthcare_API_Design_Documentation.md`](./resources/docs/PH_Healthcare_API_Design_Documentation.md)
- Import Postman: [`resources/postman/PH Healthcare API.postman_collection.json`](./resources/postman/PH%20Healthcare%20API.postman_collection.json)

---

## 7. Project structure

Click a path to open that folder or file.

```text
src/
├── server.ts                          # connect DB + Redis, seed, cron, listen
├── app.ts                             # cors, parsers, route mounts, errors
└── app/
    ├── config/index.ts                # all env vars
    ├── lib/
    │   ├── prisma.ts                  # shared Prisma client
    │   ├── redits.ts                  # Redis client
    │   ├── bkash.ts                   # bKash helpers
    │   ├── cloudinary.ts              # file uploads
    │   ├── cron.ts                    # unpaid hold + cleanup jobs
    │   ├── googleAuth.ts
    │   ├── multer.ts
    │   └── nodemailer.ts
    ├── middleware/
    │   ├── checkAuth.ts
    │   ├── validateRequest.ts
    │   ├── globalErrorHandler.ts
    │   └── notFound.ts
    ├── utils/
    │   ├── catchAsync.ts
    │   ├── jwt.ts
    │   ├── sendResponse.ts
    │   ├── AppError.ts
    │   ├── appointment-invoice.ts
    │   └── seed.ts
    └── module/
        ├── auth/
        ├── user/
        ├── doctor/
        ├── shedule/                   # folder name is shedule
        ├── appointment/
        ├── payment/
        ├── prescription/
        ├── contact/
        └── templates/                 # EJS email templates

prisma/
├── schema/                            # split Prisma models
└── migrations/                        # committed SQL
```

| Path | Link |
| --- | --- |
| App entry | [`src/app.ts`](./src/app.ts) |
| Server boot | [`src/server.ts`](./src/server.ts) |
| Config | [`src/app/config`](./src/app/config) |
| Shared libs | [`src/app/lib`](./src/app/lib) |
| Middleware | [`src/app/middleware`](./src/app/middleware) |
| Feature modules | [`src/app/module`](./src/app/module) |
| Prisma schema | [`prisma/schema`](./prisma/schema) |
| Migrations | [`prisma/migrations`](./prisma/migrations) |
| Env example | [`.env.example`](./.env.example) |

Each feature module follows:

| File | Responsibility |
| --- | --- |
| `*.route.ts` / `*.router.ts` | Wire path → middleware → controller |
| `*.controller.ts` | Read request, call service, `sendResponse` |
| `*.service.ts` | Business logic + Prisma |
| `*.validation.ts` | Zod schemas |
| `*.interface.ts` | TypeScript payload types |

Controllers never call Prisma directly. Services never touch `req` / `res`.

---

## 8. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| **Node.js** | 20+ | `node -v` |
| **PostgreSQL** | 14+ | `psql -V` |
| **Redis** | 6+ | needed for OTP / pending registration |
| **npm** | any recent | examples below use `npm` |

You also need accounts (or sandbox keys) for:

- SMTP email (OTP, invoice, prescription)
- Cloudinary (profile / resume / PDF uploads)
- bKash sandbox (payments)
- Optional: Google client id (Google login)

---

## 9. Setup guide

### 1) Clone and install

```bash
git clone https://github.com/kaziashik/PH-Healthcare-Backend.git
cd PH-Healthcare-Backend
npm install
```

### 2) Create `.env`

```bash
cp .env.example .env
```

Open `.env` and fill the values listed in [Environment variables](#10-environment-variables).

Minimum local values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/ph_healthcare?schema=public"
FRONTEND_URL="http://localhost:3000"
PORT=5000
```

### 3) Generate Prisma client

```bash
npm run build
```

Or generate only:

```bash
node node_modules/prisma/build/index.js generate
```

> On some Windows setups `npx prisma` fails with `Class extends value undefined...`. Use the local binary above, or `npm run build`.

Prisma writes the client to `src/generated/prisma` (git-ignored).

### 4) Run migrations

```bash
node node_modules/prisma/build/index.js migrate deploy
```

For local development with new migrations:

```bash
node node_modules/prisma/build/index.js migrate dev
```

### 5) Start the API

```bash
npm run dev
```

Expected logs:

```text
Connected to the database successfully.
Redis Connected Successfully
NodeMailer connected successfully
Server is running on port 5000
```

### 6) Smoke test

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to PH Healthcare System Backend"}
```

Public doctors:

```bash
curl "http://localhost:5000/api/v1/doctor/all-doctors"
```

On first boot the seed helpers create starter super admin / tester accounts when their env values are set (see seed vars below). Do not commit real passwords.

---

## 10. Environment variables

All reads go through [`src/app/config/index.ts`](./src/app/config/index.ts).

### Core

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `production` |
| `PORT` | HTTP port (default `5000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | API public URL (optional helper) |
| `FRONTEND_URL` | CORS allowlist for the Next.js app |

### Auth

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET` | Access token signing key |
| `JWT_REFRESH_SECRET` | Refresh token signing key |
| `JWT_ACCESS_EXPIRES_IN` | e.g. `1d` |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `7d` |
| `BCRYPT_SALT_ROUNDS` | Password hash rounds |
| `GOOGLE_CLIENT_ID` | Google sign-in |
| `FACEBOOK_APP_ID` | Facebook login (optional, currently unused) |
| `FACEBOOK_APP_SECRET` | Facebook login (optional) |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Redis

| Variable | Purpose |
| --- | --- |
| `REDIS_USER` | Redis username |
| `REDIS_PASSWORD` | Redis password |
| `REDIS_HOST` | Host |
| `REDIS_PORT` | Port |

Used for registration OTP / pending doctor application data.

### Email (Nodemailer)

| Variable | Purpose |
| --- | --- |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password / app password |
| `EMAIL_SENDER` | From address |

### Cloudinary

| Variable | Purpose |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### bKash

| Variable | Purpose |
| --- | --- |
| `BKASH_BASE_URL` | Sandbox / live base URL |
| `BKASH_USERNAME` | Merchant username |
| `BKASH_PASSWORD` | Merchant password |
| `BKASH_APP_KEY` | App key |
| `BKASH_APP_SECRET` | App secret |
| `BKASH_CALLBACK_URL` | Must point at this API callback route |

Local callback example:

```text
http://localhost:5000/api/v1/appointment/book-appointment/payment/callback
```

Live callback example:

```text
https://ph-healthcare-api.vercel.app/api/v1/appointment/book-appointment/payment/callback
```

### Seed accounts (optional, local / demo)

| Variable | Purpose |
| --- | --- |
| `SUPER_ADMIN_NAME` / `EMAIL` / `PASSWORD` | Seeded super admin |
| `TESTER_ADMIN_NAME` / `EMAIL` / `PASSWORD` | Seeded admin |
| `TESTER_DOCTOR_NAME` / `EMAIL` / `PASSWORD` | Seeded doctor |

Keep these out of public chat and out of git.

---

## 11. Scripts

```bash
npm run dev        # tsx watch ./src/server.ts
npm run build      # prisma generate + tsup → dist/server.js
npm start          # node dist/server.js
npm run typecheck  # tsc --noEmit
```

Prisma helpers (prefer local binary if `npx` fails):

```bash
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js migrate dev
node node_modules/prisma/build/index.js studio
```

---

## 12. Response format

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable description",
  "data": {}
}
```

List endpoints may also return pagination meta.

Error:

```json
{
  "success": false,
  "message": "Human-readable description of what went wrong"
}
```

---

## 13. Cron jobs

Defined in [`src/app/lib/cron.ts`](./src/app/lib/cron.ts), started from [`src/server.ts`](./src/server.ts).

| Job | Purpose |
| --- | --- |
| Release unpaid appointments | Clears expired `PENDING` holds so slots open again |
| Delete unverified doctors | Cleans stale unverified applications |

These run on a normal Node host. On **Vercel**, `process.env.VERCEL === "1"`, so the HTTP listener/cron path is serverless-oriented and local cron does not keep running the same way. Use a local or always-on Node process if you need the unpaid-slot cleaner in production.

---

## 14. Deploy

This repo is linked to the Vercel project **ph-healthcare-api**.

```bash
npm run build
vercel --prod --yes --scope ashik-s-projects5
```

`vercel.json` serves `dist/server.js`. Env vars must already be set in the Vercel project dashboard (do not upload `.env`).

Live API: [https://ph-healthcare-api.vercel.app](https://ph-healthcare-api.vercel.app)

---

## 15. Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot find module '.../src/generated/prisma'` | Run Prisma generate / `npm run build` |
| `npx prisma` crashes on Windows | Use `node node_modules/prisma/build/index.js ...` |
| `Can't reach database server` | Check Postgres and `DATABASE_URL` |
| Redis connection error | Check `REDIS_*` and that Redis is reachable |
| Login works but frontend CORS fails | Set `FRONTEND_URL` to the exact frontend origin |
| bKash callback never completes | `BKASH_CALLBACK_URL` must match this API’s callback path |
| OTP email never arrives | Check `SMTP_*` / `EMAIL_SENDER` and spam folder |
| Upload fails | Check Cloudinary keys |

---

## Extending the API

1. Add a folder under [`src/app/module`](./src/app/module)
2. Add route / controller / service / validation / interface
3. Mount it in [`src/app.ts`](./src/app.ts):

```ts
app.use("/api/v1/your-module", YourRoutes);
```

4. Update [`API-Routes.md`](./API-Routes.md) and the Postman collection

---

Built as the API half of **PH Healthcare**. The UI lives in the [frontend repository](https://github.com/kaziashik/PH-Healthcare-Management-System-Frontend).
