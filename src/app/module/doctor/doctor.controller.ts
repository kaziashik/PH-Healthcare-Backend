import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorServices } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";
import { IVerifyDoctorEmailPayload } from "./doctor.interface";
import { prisma } from "../../lib/prisma";
import { Role } from "../../../generated/prisma/enums";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	console.log({ files });
	const resume = files?.["resume"] ? files["resume"][0] : null;
	const additionalFiles = files?.["additionalFiles"] || [];

	const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(
		JSON.parse(req.body.data),
	);

	if (!zodValidationResult.success) {
		throw new Error(zodValidationResult.error.issues[0].message);
	}

	const payload = zodValidationResult.data;

	const result = await DoctorServices.applyAsDoctor(
		payload,
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Verification OTP Sent",
		data: result,
	});
});


const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
	
	const payload = req.body;

	const result = await DoctorServices.verifyDoctorEmail(payload)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Email verified. Your application is pending admin approval.",
		data: result,
	});
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	
	const payload = req.body;
	const user = req.user!

	const result = await DoctorServices.approveDoctor(payload, user)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Applicaton  Verified Successfully",
		data: result,
	});
});


const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	const {data, meta} = await DoctorServices.getAllDoctors(req.query, req.user)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data: data,
		meta : meta,
	});
});

const updateDoctorProfile = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.body;
		const user = req.user!;

		const result = await DoctorServices.updateDoctorProfile(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Updated Successfully",
			data: result,
		});
	},
);





export const DoctorController = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile
};
