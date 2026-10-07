import { Router } from "express";
import { upload } from "../../lib/multer";
import { DoctorController } from "./doctor.controller";
import { auth, optionalAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { ApproveDoctorValidationZodSchema, UpdateDoctorProfileValidationZodSchema, VerifyDoctorEmailValidationZodSchema } from "./doctor.validation";

const router = Router();

router.post(
	"/apply-as-doctor",
	// validateRequest(UserValidation.ResetPasswordZodSchema),
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},

		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	DoctorController.applyAsDoctor,
);

router.post(
	"/apply-as-doctor/verify-email",
	validateRequest(VerifyDoctorEmailValidationZodSchema),
	DoctorController.verifyDoctorEmail,
);

router.post(
  "/approve-doctor",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(ApproveDoctorValidationZodSchema),
  DoctorController.approveDoctor,
);

router.get(
	"/all-doctors",
	optionalAuth,
	DoctorController.getAllDoctors,
);

router.patch(
	"/update-my-profile",
	auth(Role.DOCTOR),
	validateRequest(UpdateDoctorProfileValidationZodSchema),
	DoctorController.updateDoctorProfile,
);


export const DoctorRoutes = router;
