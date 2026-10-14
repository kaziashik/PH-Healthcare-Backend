import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync"
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";
import { ICreateManagedAccountPayload, IUpdateAccountStatusPayload, IUpdateMyProfilePayload } from "./user.interface";
import { Role } from "../../../generated/prisma/enums";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const updateProfileImage=catchAsync(async (req: Request, res: Response) => {

  if(!req.file){
    throw new AppError(httpStatus.BAD_REQUEST, "No File Provided");
  }

  if (!PHOTO_TYPES.has(req.file.mimetype)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Profile photo must be a JPG, PNG, or WEBP image",
    );
  }

  if (req.file.size > MAX_PHOTO_BYTES) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Profile photo must be 2 MB or smaller",
    );
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


const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, "You Are Not Logged In");
  }

  const result = await userService.updateMyProfile(
    userId,
    req.body as IUpdateMyProfilePayload,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

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
    updateMyProfile,
    createAdmin,
    createSuperAdmin,
    updateAccountStatus,
    getPatients,
    getAdmins,
}