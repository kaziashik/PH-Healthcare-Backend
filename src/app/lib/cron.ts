import cron from "node-cron";
import {
  AppointmentStatus,
  DoctorVerificationStatus,
  PaymentStatus,
  Role,
} from "../../generated/prisma/enums";
import { prisma } from "./prisma";

const UNPAID_HOLD_MS = 5 * 60 * 1000;

export const releaseUnpaidAppointments = async () => {
  cron.schedule("0 * * * * *", async () => {
    try {
      const expiredBefore = new Date(Date.now() - UNPAID_HOLD_MS);
      const staleAppointments = await prisma.apppointment.findMany({
        where: {
          status: AppointmentStatus.PENDING,
          updatedAt: { lt: expiredBefore },
          OR: [
            { payment: { is: null } },
            { payment: { status: { not: PaymentStatus.PAID } } },
          ],
        },
        include: {
          schedule: true,
          payment: true,
        },
      });

      for (const appointment of staleAppointments) {
        await prisma.$transaction(async (tx) => {
          const heldASlot = appointment.serialNumber != null;
          const released = await tx.apppointment.updateMany({
            where: {
              id: appointment.id,
              status: AppointmentStatus.PENDING,
            },
            data: {
              status: AppointmentStatus.CANCELLED,
              serialNumber: null,
              joiningTime: null,
            },
          });

          if (released.count === 0) {
            return;
          }

          if (heldASlot) {
            await tx.schedule.updateMany({
              where: {
                id: appointment.scheduleId,
                availableSlots: { lt: appointment.schedule.totalSlots },
              },
              data: { availableSlots: { increment: 1 } },
            });
          }

          if (appointment.payment?.status === PaymentStatus.UNPAID) {
            await tx.payment.update({
              where: { id: appointment.payment.id },
              data: { status: PaymentStatus.CANCELLED },
            });
          }
        });
      }

      if (staleAppointments.length > 0) {
        console.log(
          `Cron: Released ${staleAppointments.length} unpaid appointments older than 5 minutes`,
        );
      }
    } catch (error) {
      console.log("Cron: Failed to release unpaid appointments", error);
    }
  });
};

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
