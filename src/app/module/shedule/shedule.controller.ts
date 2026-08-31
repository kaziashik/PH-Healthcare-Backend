import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { ScheduleServices } from "./shedule.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user!;

    const result = await ScheduleServices.createSchedule(payload, user);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Schedule Created Successfully",
        data: result,
    });
});


const getMySchedules = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data, meta } = await ScheduleServices.getMySchedules(req.query, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedules Retrieved Successfully",
        data,
        meta,
    });
});

const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
    const { data, meta } = await ScheduleServices.getAllSchedules(req.query);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedules Retrieved Successfully",
        data,
        meta,
    });
});




export const ScheduleController = {
    createSchedule,
    getMySchedules,
    getAllSchedules,
    // getTodaysSchedules,
    // getScheduleById,
    // updateSchedule,
    // publishSchedule,
    // deleteSchedule,
};
