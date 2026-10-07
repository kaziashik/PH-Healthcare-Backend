import { Router } from "express";
import { userController } from "./user.controller";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { CreateManagedAccountZodSchema, UpdateAccountStatusZodSchema } from "./user.validation";

const router = Router();

router.post(
  "/create-admin",
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(CreateManagedAccountZodSchema),
  userController.createAdmin,
);

router.post(
  "/create-super-admin",
  auth(Role.SUPER_ADMIN),
  validateRequest(CreateManagedAccountZodSchema),
  userController.createSuperAdmin,
);

router.patch(
  "/account-status",
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(UpdateAccountStatusZodSchema),
  userController.updateAccountStatus,
);

router.get(
  "/patients",
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  userController.getPatients,
);

router.get(
  "/admins",
  auth(Role.SUPER_ADMIN, Role.ADMIN),
  userController.getAdmins,
);

router.patch("/profile-image",auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),upload.single("profileImage"),userController.updateProfileImage);


export const userRoutes = router;
