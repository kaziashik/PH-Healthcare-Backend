import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync"
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";
import { ICreateManagedAccountPayload, IUpdateAccountStatusPayload } from "./user.interface";
import { Role } from "../../../generated/prisma/enums";

const updateProfileImage=catchAsync(async (req: Request, res: Response) => {

  if(!req.file){
    throw new AppError(httpStatus.BAD_REQUEST, "No File Provided");
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


const createAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.createManagedAccount(
    req.body as ICreateManagedAccountPayload,
    Role.ADMIN,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Admin created successfully. Login details were sent to their personal email.",
    data: result,
  });
});

const createSuperAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.createManagedAccount(
    req.body as ICreateManagedAccountPayload,
    Role.SUPER_ADMIN,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Super admin created successfully. Login details were sent to their personal email.",
    data: result,
  });
});

const updateAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.updateAccountStatus(
    req.body as IUpdateAccountStatusPayload,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account status updated successfully",
    data: result,
  });
});

const getPatients = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getPatients(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Patients retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

const getAdmins = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.getAdmins(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admins retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const userController={
    updateProfileImage,
    createAdmin,
    createSuperAdmin,
    updateAccountStatus,
    getPatients,
    getAdmins,
}