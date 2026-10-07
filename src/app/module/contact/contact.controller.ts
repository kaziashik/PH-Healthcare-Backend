import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ContactServices, type IContactMessage } from "./contact.service";

const sendContactMessage = catchAsync(async (req: Request, res: Response) => {
	const data = await ContactServices.sendContactMessage(
		req.body as IContactMessage,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Message sent to the clinic",
		data,
	});
});

export const ContactController = {
	sendContactMessage,
};
