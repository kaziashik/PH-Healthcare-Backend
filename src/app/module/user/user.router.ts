import { NextFunction, Request, Response, Router } from "express";
import { userController } from "./user.controller";

const router = Router();





router.patch("/profile-image",userController.updateProfileImage);
export const userRoutes = router;
