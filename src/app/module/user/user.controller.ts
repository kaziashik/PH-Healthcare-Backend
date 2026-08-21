import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync"
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";

const updateProfileImage=catchAsync(async (req: Request, res: Response) => {

  const payload = req.body;


  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Verification OTP Sent",
    data: null
  });
})


export const userController={
    updateProfileImage
}