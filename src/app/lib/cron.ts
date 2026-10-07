import cron from "node-cron";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "./prisma";

export const deleteUnverifiedDoctors = async () => {
  cron.schedule("0 */10 * * * *", async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deletedDoctors = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: { lt: oneHourAgo },
          doctor: {
            verificationStatus: DoctorVerificationStatus.PENDING,
          },
        },
      });

      if (deletedDoctors.count > 0) {
        console.log(`
                Cron: Deleted ${deletedDoctors.count} unverified email doctor applications older than 1 hour
                `);
      }

      const deletedRejectedDoctors = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          doctor: {
            verificationStatus: DoctorVerificationStatus.REJECTED,
            reviewedAt: {
              lt: thirtyDaysAgo,
            },
          },
        },
      });

      if (deletedRejectedDoctors.count > 0) {
        console.log(
          `Cron: Deleted ${deletedRejectedDoctors.count} rejected doctor applications older than 30 days`,
        );
      }
    } catch (error) {
      console.log(
        "Cron: Failed to delete unverified doctor applications",
        error,
      );
    }

    console.log("Unverified Doctor Delete cron schedule (every 10 minutes)");
  });
};
