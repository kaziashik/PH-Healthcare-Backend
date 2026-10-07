import { addDays, differenceInMinutes, isAfter, isSameDay, startOfDay } from "date-fns";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateSchedulePayload, IUpdateSchedulePayload } from "./shedule.interface";
import httpStatus from "http-status";
import { ScheduleWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interfaces";
import { AppointmentStatus, DoctorVerificationStatus, ScheduleStatus, UserStatus } from "../../../generated/prisma/enums";

const MIN_SCHEDULE_MINUTES = 3 * 60;
const MAX_SCHEDULE_MINUTES = 8 * 60;
const MINUTES_PER_SLOT = 20;

const assertScheduleWindow = (startDateTime: Date, endDateTime: Date) => {
    if (!isSameDay(startDateTime, endDateTime)) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Start Date Time And End Date Time Must Be On The Same Day",
        );
    }

    if (!isAfter(endDateTime, startDateTime)) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Start Date Time Cannot Be After End Date Time",
        );
    }

    const durationInMinutes = differenceInMinutes(endDateTime, startDateTime);

    if (
        durationInMinutes < MIN_SCHEDULE_MINUTES ||
        durationInMinutes > MAX_SCHEDULE_MINUTES
    ) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Schedule Time Range Must Be At Least 3 Hours And At Most 8 Hours",
        );
    }

    return durationInMinutes;
};

const createSchedule = async (payload : ICreateSchedulePayload , user : RequestUser) => {

    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const durationInMinutes = assertScheduleWindow(
        payload.startDateTime,
        payload.endDateTime,
    );


    //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
    const startOfTheDay = startOfDay(payload.startDateTime) // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
    const startOfNextDay = addDays(startOfTheDay, 1)  // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

    const existingScheduleOnThisDate = await prisma.schedule.findFirst({
        where : {
            doctorId : doctor.id,
            isDeleted : false,
            startDateTime : {
                gte : startOfTheDay,
                lt : startOfNextDay
            }
        }
    })

    if(existingScheduleOnThisDate) {
        throw new AppError(
            httpStatus.CONFLICT,
            "You Already Have A Schedule For This Date",
        );
    }

    const totalSlots = Math.floor(durationInMinutes / MINUTES_PER_SLOT)

    const schedule = await prisma.schedule.create({
        data : {
            startDateTime : payload.startDateTime,
            endDateTime : payload.endDateTime,
            meetingLink : payload.meetingLink,
            totalSlots,
            availableSlots : totalSlots,
            doctorId : doctor.id
        },
        include : {
            doctor : {
                select : {
                    name : true,
                    email : true,
                    contactNumber : true
                }
            }
        }
    })

    return schedule
}

const getMySchedules = async (query : IQuery, user : RequestUser) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    // let limit = 10;
    // if (query.limit) {
    //     limit = Number(query.limit);
    // }

    // let page = 1;
    // if (query.page) {
    //     page = Number(query.page);
    // }

    // const skip = (page - 1) * limit;

    

    const andConditions: ScheduleWhereInput[] = [
        {
            doctorId : doctor.id
        },
        {
            isDeleted : false
        }
    ];

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    const schedules = await prisma.schedule.findMany({
        where : {
            AND : andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include : {
            appointments : {
                include : {
                    patient : true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}


const getAllSchedules = async (query : IQuery) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const andConditions: ScheduleWhereInput[] = [];

    if (query.doctorId) {
        andConditions.push({ doctorId: query.doctorId });
    }
    if (query.email) {
        andConditions.push({ doctor : {
            email : query.email
        } });
    }

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    if (query.searchTerm) {
        andConditions.push({
            doctor: {
                OR: [
                    { name: { contains: query.searchTerm, mode: "insensitive" } },
                    { email: { contains: query.searchTerm, mode: "insensitive" } },
                    {
                        specialization: { contains: query.searchTerm, mode: "insensitive" },
                    },
                ],
            },
        });
    };

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include: {
            appointments: {
                include: {
                    patient: true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getScheduleById = async (scheduleId : string) => {

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
            doctor: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    specialization: true,
                    userId: true,
                },
            },
            appointments: {
                include: {
                    patient: true
                },
            }
        },
    });

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    return schedule

}


const publishSchedule = async (scheduleId : string, user : RequestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, doctorId : doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
    }

    const publishedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { status: ScheduleStatus.PUBLISHED },
    });

    return publishedSchedule;
}


const updateSchedule = async (scheduleId : string, payload : IUpdateSchedulePayload, user : RequestUser) => {

    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where : { id : scheduleId, doctorId : doctor.id}
    })

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    const startDateTime = payload.startDateTime ?? schedule.startDateTime;
    const endDateTime = payload.endDateTime ?? schedule.endDateTime;
    const meetingLink = payload.meetingLink ?? schedule.meetingLink;
    const status = payload.status ?? schedule.status;

    if (
        schedule.status === ScheduleStatus.PUBLISHED &&
        !isSameDay(startDateTime, schedule.startDateTime)
    ) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Schedule Date Is Locked After Publish",
        );
    }

    const timeChanged =
        startDateTime.getTime() !== new Date(schedule.startDateTime).getTime() ||
        endDateTime.getTime() !== new Date(schedule.endDateTime).getTime();

    const activeBooking = await prisma.apppointment.findFirst({
        where: {
            scheduleId: schedule.id,
            serialNumber: { not: null },
            status: {
                in: [
                    AppointmentStatus.BOOKED,
                    AppointmentStatus.CONFIRMED,
                    AppointmentStatus.ONGOING,
                    AppointmentStatus.COMPLETED,
                ],
            },
        },
    });

    if (timeChanged && activeBooking) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Time Range Is Locked After The First Appointment Is Booked",
        );
    }

    let totalSlots = schedule.totalSlots;
    let availableSlots = schedule.availableSlots;

    if (timeChanged) {
        const durationInMinutes = assertScheduleWindow(startDateTime, endDateTime);
        totalSlots = Math.floor(durationInMinutes / MINUTES_PER_SLOT);
        availableSlots = totalSlots;

        const startOfTheDay = startOfDay(startDateTime);
        const startOfNextDay = addDays(startOfTheDay, 1);

        const existingScheduleOnThisDate = await prisma.schedule.findFirst({
            where: {
                id: { not: schedule.id },
                doctorId: doctor.id,
                isDeleted: false,
                startDateTime: {
                    gte: startOfTheDay,
                    lt: startOfNextDay,
                },
            },
        });

        if (existingScheduleOnThisDate) {
            throw new AppError(
                httpStatus.CONFLICT,
                "You Already Have A Schedule For This Date",
            );
        }
    }

    const updatedSchedule = await prisma.schedule.update({
        where : {
            id : schedule.id
        },
        data: {
            startDateTime,
            endDateTime,
            meetingLink,
            status,
            totalSlots,
            availableSlots,
        },
        include: {
            doctor: {
                select: {
                    name: true,
                    email: true,
                    contactNumber: true
                }
            }
        }
    })

    return updatedSchedule
}




const getTodaysSchedules = async (query : IQuery) => {
    if (query.doctorId) {
        const doctor = await prisma.doctor.findUnique({
            where: { id : query.doctorId },
        });

        if (!doctor) {
            throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
        }
    }

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfTomorrow = addDays(startOfToday, 1)

    const andConditions: ScheduleWhereInput[] = [
        {
            isDeleted : false
        },
        {
            status : ScheduleStatus.PUBLISHED
        },
        {
            startDateTime : {
                gte : startOfToday,
                lt : startOfTomorrow,
                gt: now
            }
        },
        {
            availableSlots : { gt : 0}
        },
        {
            doctor: {
                verificationStatus: DoctorVerificationStatus.APPROVED,
                isDeleted: false,
                user: {
                    status: UserStatus.ACTIVE,
                    isDeleted: false,
                },
            },
        },
    ];

    if (query.doctorId) {
        andConditions.push({ doctorId: query.doctorId });
    }

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include: {
            doctor: {
                select: {
                    id: true,
                    name: true,
                    specialization: true,
                    consultationFee: true,
                },
            },
        },
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, doctorId: doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Once Published And Appoinement Booked Cannot Be Deleted");
    };

    const deletedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { isDeleted: true, deletedAt: new Date() },
    });

    return deletedSchedule;
}

export const ScheduleServices = {
    createSchedule,
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    publishSchedule,
    deleteSchedule,
    getTodaysSchedules
}