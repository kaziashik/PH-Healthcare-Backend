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


router.post("/verify-email",
	validateRequest(userValidation.PatientEmailVerifyZodSchema),
	 AuthController.verifyPatientEmail);



router.post("/login",validateRequest(userValidation.LoginZodSchema), AuthController.loginUser);


router.get(
  "/login",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  AuthController.getMe,
);

router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	// validateRequest
	AuthController.getMe,
)

router.post("/google", AuthController.googleLogin);
router.post("/refresh-token", AuthController.refreshToken);





router.post("/forgot-password",validateRequest(userValidation.ForgetPasswordZodSchema), AuthController.forgotPassword);
router.post("/reset-password",validateRequest(userValidation.ResetPasswordZodSchema), AuthController.restPassword);


router.post("/logout", AuthController.logout);


export const AuthRoutes = router;
