-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "gender" "Gender",
ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "bloodGroup" TEXT,
ADD COLUMN "medicalHistory" TEXT;

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationEmail" TEXT NOT NULL,
    "personalEmail" TEXT NOT NULL,
    "contactNumber" TEXT,
    "address" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_organizationEmail_key" ON "admins"("organizationEmail");

-- CreateIndex
CREATE UNIQUE INDEX "admins_userId_key" ON "admins"("userId");

-- CreateIndex
CREATE INDEX "idx_admin_organization_email" ON "admins"("organizationEmail");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
