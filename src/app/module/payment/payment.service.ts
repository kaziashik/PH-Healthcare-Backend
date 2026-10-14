import httpStatus from "http-status";
import { PaymentStatus, Role } from "../../../generated/prisma/enums";
import { buildAppointmentInvoicePdf } from "../../utils/appointment-invoice";
import { PaymentWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interfaces";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";


const getMyPayments = async (query : IQuery, user : RequestUser) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;

    const patient = await prisma.patient.findUnique({
        where: { userId: user.userId },
    });

    if (!patient) {
        throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }

    const andConditions : PaymentWhereInput[] = [
        {
            appointment: { patientId: patient.id }
        }
    ]

    const payments = await prisma.payment.findMany({
        where: { AND : andConditions },
        orderBy: { createdAt: "desc" },
        include: {
            appointment: {
                include: {
                    doctor: {
                        select: {
                            id: true,
                            name: true,
                            specialization: true,
                            user: { select: { imageUrl: true } },
                        },
                    },
                    schedule: {
                        select: {
                            startDateTime: true,
                            endDateTime: true,
                            meetingLink: true,
                        },
                    },
                },
            },
        },
    });

    const rank = (status: string) => {
        if (status === "PAID") return 0;
        if (status === "CANCELLED") return 2;
        return 1;
    };

    const ordered = [...payments].sort((left, right) => {
        const byStatus = rank(left.status) - rank(right.status);
        if (byStatus !== 0) return byStatus;
        const leftTime = new Date(left.paidAt ?? left.createdAt).getTime();
        const rightTime = new Date(right.paidAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
    });

    const visible = ordered.map((payment) => {
        if (payment.status === "PAID" || !payment.appointment.schedule) {
            return payment;
        }
        return {
            ...payment,
            appointment: {
                ...payment.appointment,
                schedule: {
                    ...payment.appointment.schedule,
                    meetingLink: "",
                },
            },
        };
    });

    const total = visible.length;

    return {
        data: visible.slice(skip, skip + limit),
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };


}

const getPaymentSummary = async () => {
    const paid = await prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true },
        _count: { _all: true },
    });

    return {
        paidAmount: Number(paid._sum.amount ?? 0),
        paidCount: paid._count._all,
        currency: "BDT",
    };
};

const getAllPayments = async (query: IQuery) => {
    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const andConditions: PaymentWhereInput[] = []

    if(query.patientEmail) {
        andConditions.push({
            appointment : {
                patient : {
                    email : query.patientEmail
                }
            }
        })
    }

    const payments = await prisma.payment.findMany({
        where: { AND: andConditions },
        take: limit,
        skip,
        orderBy: { [sortBy]: sortOrder },
        include: {
            appointment: {
                include: {
                    doctor: { select: { id: true, name: true, specialization: true } },
                    schedule: true,
                },
            },
        },
    });

    const total = await prisma.payment.count({
        where: { AND: andConditions },
    });

    return {
        data: payments,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getMyReceipt = async (paymentId: string, user: RequestUser) => {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
            appointment: {
                include: {
                    patient: {
                        select: { name: true, email: true, userId: true },
                    },
                    doctor: { select: { name: true, specialization: true } },
                    schedule: {
                        select: { startDateTime: true, meetingLink: true },
                    },
                },
            },
        },
    });

    if (!payment) {
        throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
    }

    if (payment.appointment.patient.userId !== user.userId) {
        throw new AppError(
            httpStatus.FORBIDDEN,
            "You Are Not Allowed To View This Receipt",
        );
    }

    if (payment.status !== PaymentStatus.PAID) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "A Receipt Is Available After The Payment Is Paid",
        );
    }

    const appointment = payment.appointment;

    return buildAppointmentInvoicePdf({
        patientName: appointment.patient.name,
        patientEmail: appointment.patient.email,
        doctorName: appointment.doctor.name,
        specialization: appointment.doctor.specialization,
        appointmentDate: appointment.schedule.startDateTime.toDateString(),
        joiningTime: appointment.joiningTime?.toString() ?? "",
        serialNumber: String(appointment.serialNumber ?? ""),
        meetingLink: appointment.schedule.meetingLink,
        amount: String(payment.amount),
        transactionId: payment.bkashTrxId ?? "",
        paidAt: payment.paidAt ?? "",
    });
};

const getSinglePayment = async (paymentId: string, user: RequestUser) => {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
            appointment: {
                include: {
                    patient: {
                        select: { id: true, name: true, email: true, userId: true },
                    },
                    doctor: { select: { id: true, name: true, specialization: true } },
                    schedule: true,
                },
            },
        },
    });

    if (!payment) {
        throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
    }

    if (user.role === Role.PATIENT) {
        if (payment.appointment.patient.userId !== user.userId) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "You Are Not Allowed To View This Payment",
            );
        }
    }

    return payment
}

export const PaymentServices = {
    getPaymentSummary,
    getAllPayments,
    getMyPayments,
    getMyReceipt,
    getSinglePayment
}