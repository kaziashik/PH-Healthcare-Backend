import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync"
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";

const updateProfileImage=catchAsync(async (req: Request, res: Response) => {

  if(!req.file){
    throw new Error("No File Provided");
  }

  const userId=req.user?.userId;

  const result=await userService.updateProfileImage(req.file?.buffer,userId!)


  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile image updated successfully",
    data: result
  });
})


export const userController={
    updateProfileImage
}