import { NextFunction, Request, Response, Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { catchAsync } from "../../utils/catchAsync";
import z from "zod";
import { validateRequest } from "../../middleware/validateRequest";
import { userValidation } from "./auth.validation";

const router = Router();



router.post(
  "/register",validateRequest(userValidation.PatientRegistrationZodSchema),
  AuthController.registerPatient,
);
router.post("/login",validateRequest(userValidation.LoginZodSchema), AuthController.loginUser);
router.get(
  "/me",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  AuthController.getMe,
);
router.post("/google", AuthController.googleLogin);
router.post("/refresh-token", AuthController.refreshToken);
export const AuthRoutes = router;
