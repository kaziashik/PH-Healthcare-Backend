# PH Healthcare API routes

Taken from the route files in `src/app/module` and the mounts in `src/app.ts`.

Live base: `https://ph-healthcare-api.vercel.app`

Local base: `http://localhost:5000`

Feature routes use the prefix `/api/v1`. `GET /` and `GET /test` are on the server root.

Signed-in routes read the httpOnly auth cookie. Send `credentials: include`.

A password field must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.

List routes share these query fields unless a row says otherwise:

| Query | Default |
| --- | --- |
| `page` | `1` |
| `limit` | `10` |
| `sortBy` | `createdAt` |
| `sortOrder` | `desc` (`asc` or `desc`) |

## Root

Mounted in `src/app.ts`.

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/` | Public | Welcome message. |
| GET | `/test` | Public | Welcome message plus a random 6-digit number. |

## Auth

File: `src/app/module/auth/auth.route.ts`

Mount: `/api/v1/auth`

| Method | Path | Who | Body | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Public | `name` (3–10 characters), `email`, `password`. Optional `patient`: `contactNumber`, `gender` (`MALE`, `FEMALE`, `OTHER`), `dateOfBirth`, `bloodGroup`, `medicalHistory` | Starts a patient account and sends an email code. |
| POST | `/api/v1/auth/verify-email` | Public | `email`, `otp` (6 characters) | Confirms the patient email. |
| POST | `/api/v1/auth/login` | Public | `email`, `password` | Signs in and sets the auth cookies. |
| GET | `/api/v1/auth/login` | Patient, Doctor, Admin, Super admin | — | Returns the signed-in user. Same handler as `/auth/me`. |
| GET | `/api/v1/auth/me` | Patient, Doctor, Admin, Super admin | — | Returns the signed-in user. |
| POST | `/api/v1/auth/google` | Public | `idToken` | Signs in with Google. Creates a patient when the email is new. |
| POST | `/api/v1/auth/facebook` | Public | `accessToken` | Signs in with Facebook. Stays unused until Facebook app credentials exist. |
| POST | `/api/v1/auth/refresh-token` | Refresh cookie | — | Issues a new access token. |
| POST | `/api/v1/auth/forgot-password` | Public | `email` | Emails a reset code. |
| POST | `/api/v1/auth/reset-password` | Public | `email`, `newPassword`, `otp` (6 characters) | Sets a new password with that code. |
| POST | `/api/v1/auth/change-password` | Patient, Doctor, Admin, Super admin | `currentPassword`, `newPassword` | Changes the password of the signed-in user. |
| POST | `/api/v1/auth/set-password` | Patient | `newPassword` | Adds a password for a patient who signed in with Google. |
| POST | `/api/v1/auth/logout` | Public | — | Clears the auth cookies. |

## Users

File: `src/app/module/user/user.router.ts`

Mount: `/api/v1/user`

| Method | Path | Who | Body or query | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/user/create-admin` | Admin, Super admin | `name`, `organizationEmail`, `personalEmail`. Optional `contactNumber`, `address` | Creates an admin. The login is the organization email. |
| POST | `/api/v1/user/create-super-admin` | Super admin | Same fields as create admin | Creates a super admin. |
| PATCH | `/api/v1/user/account-status` | Admin, Super admin | `userId`, `status` (`ACTIVE` or `BLOCKED`) | Blocks or unblocks an account. Only a super admin can change an admin or super admin. |
| GET | `/api/v1/user/patients` | Admin, Super admin | `page`, `limit`, `sortBy`, `sortOrder`, `status`, `searchTerm` | Lists patients. |
| GET | `/api/v1/user/admins` | Admin, Super admin | Same query as patients | Lists admins and super admins. |
| PATCH | `/api/v1/user/profile-image` | Patient, Doctor, Admin, Super admin | Multipart field `profileImage` | Uploads a profile photo. |

## Doctors

File: `src/app/module/doctor/doctor.router.ts`

Mount: `/api/v1/doctor`

| Method | Path | Who | Body or query | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/doctor/apply-as-doctor` | Public | Multipart. JSON fields `user` (`name`, `email`, `password`) and `doctor` (`specialization`, `licenseNumber`, `qualifications`, `experienceYears`. Optional `address`, `bio`, `consultationFee`, `contactNumber`). Files: `resume` (1), `additionalFiles` (up to 10) | Submits a doctor application and sends an email code. |
| POST | `/api/v1/doctor/apply-as-doctor/verify-email` | Public | `email`, `otp` (6 characters) | Confirms the doctor email. The account stays off the public list until approval. |
| POST | `/api/v1/doctor/approve-doctor` | Admin, Super admin | `doctorId`, `verificationStatus` (`APPROVED` or `REJECTED`). Optional `rejectionReason` | Approves or rejects the application. |
| GET | `/api/v1/doctor/all-doctors` | Public. Admin and Super admin see more when signed in | `page`, `limit`, `searchTerm`, `specialization`, `maxFee`, `minExperience`, `email`, `licenseNumber`, `sortBy` (`createdAt`, `name`, `consultationFee`, `experienceYears`), `sortOrder`. Managers may also send `verificationStatus` | Lists doctors. Guests and patients only receive approved, active, email-verified doctors. |
| GET | `/api/v1/doctor/:doctorId` | Public, with the same visibility rule | — | One doctor. |
| PATCH | `/api/v1/doctor/update-my-profile` | Doctor | Optional `address`, `bio`, `consultationFee`, `contactNumber` | Updates the signed-in doctor's profile. |

## Schedules

File: `src/app/module/shedule/shedule.route.ts`

Mount: `/api/v1/schedule`

A schedule is 3 to 8 hours, stays on one calendar date, and splits into 20-minute slots. It starts as `DRAFT`. The date locks after publish. The time range locks after the first booking.

| Method | Path | Who | Body or query | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/schedule/create-schedule` | Doctor | `startDateTime`, `endDateTime`, `meetingLink` | Creates a draft schedule. |
| GET | `/api/v1/schedule/my-schedules` | Doctor | `page`, `limit`, `sortBy`, `sortOrder`, `status` | Lists the signed-in doctor's schedules. |
| GET | `/api/v1/schedule/all-schedules` | Admin, Super admin | `page`, `limit`, `sortBy`, `sortOrder`, `status`, `doctorId`, `email`, `searchTerm` | Lists schedules. |
| GET | `/api/v1/schedule/todays-schedule` | Public | `page`, `limit`, `sortBy`, `sortOrder`. Optional `doctorId` | Published schedules for today that still have an open slot and have not started. |
| PATCH | `/api/v1/schedule/update-schedule/:scheduleId` | Doctor | Optional `startDateTime`, `endDateTime`, `meetingLink`, `status` (`DRAFT` or `PUBLISHED`) | Updates a schedule the doctor owns. |
| PATCH | `/api/v1/schedule/publish-schedule/:scheduleId` | Doctor | — | Publishes a draft. The date locks after this. |
| GET | `/api/v1/schedule/:scheduleId` | Doctor, Admin, Super admin | — | One schedule. |
| DELETE | `/api/v1/schedule/:scheduleId` | Doctor | — | Deletes a schedule the doctor owns. |

## Appointments

File: `src/app/module/appointment/appointment.route.ts`

Mount: `/api/v1/appointment`

A booking is for today and only before the schedule starts. It begins as `PENDING` and becomes `BOOKED` after bKash succeeds. Cancel more than 1 hour before the start for a refund.

| Method | Path | Who | Body or query | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/appointment/book-appointment` | Patient | `scheduleId` | Creates a pending appointment. |
| POST | `/api/v1/appointment/pay-appointment` | Patient | `appointmentId` | Opens the bKash payment page. |
| GET | `/api/v1/appointment/book-appointment/payment/callback` | bKash redirect | Payment query from bKash | Confirms payment, assigns the serial, and emails the invoice. |
| POST | `/api/v1/appointment/cancel-appointment` | Patient, Admin, Super admin | `appointmentId` | Cancels the visit. A patient refund follows the 1-hour rule. |
| PATCH | `/api/v1/appointment/update-status/:appointmentId` | Doctor | `status` (`ONGOING` or `COMPLETED`) | Moves a booked visit forward. |
| GET | `/api/v1/appointment/my-appointments` | Patient | `page`, `limit`, `sortBy`, `sortOrder`, `status` | The signed-in patient's visits. |
| GET | `/api/v1/appointment/doctor-appointments` | Doctor | Same query as my appointments | The signed-in doctor's visits. |
| GET | `/api/v1/appointment/all-appointments` | Admin, Super admin | `page`, `limit`, `sortBy`, `sortOrder`, `status`, `doctorId`, `patientId`, `doctorEmail`, `patientEmail` | Every visit. |
| GET | `/api/v1/appointment/:appointmentId` | Patient, Doctor, Admin, Super admin | — | One visit. |

## Prescriptions

File: `src/app/module/prescription/prescription.route.ts`

Mount: `/api/v1/prescription`

| Method | Path | Who | Body | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/prescription/create-prescription` | Doctor | `appointmentId`, `findings` (at least 5 characters), `medicines` (at least one). Each medicine: `name`, `dosage`, `duration`. Optional `instructions` | Writes a prescription after the visit is completed, then emails the PDF. |
| GET | `/api/v1/prescription/:appointmentId` | Patient, Doctor, Admin, Super admin | — | The prescription for that visit. |

## Payments

File: `src/app/module/payment/payment.route.ts`

Mount: `/api/v1/payment`

| Method | Path | Who | Query | What it does |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/payment/my-payments` | Patient | `page`, `limit`, `sortBy`, `sortOrder` | The signed-in patient's payments. |
| GET | `/api/v1/payment/all-payments` | Admin, Super admin | `page`, `limit`, `sortBy`, `sortOrder`, `patientEmail` | Every payment. |
| GET | `/api/v1/payment/:paymentId` | Patient, Admin, Super admin | — | One payment. A patient can open only their own. |

## Contact

File: `src/app/module/contact/contact.route.ts`

Mount: `/api/v1/contact`

| Method | Path | Who | Body | What it does |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/contact` | Public | `name` (at least 2 characters), `email`, `subject` (at least 5), `message` (at least 20) | Sends a message to the clinic inbox. This is not a booking. |
