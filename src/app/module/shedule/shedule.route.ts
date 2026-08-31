import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { CreateScheduleValidationZodSchema } from "./shedule.validation";
import { ScheduleController } from "./shedule.controller";



const router = Router();

router.post(
    "/create-schedule",
    auth(Role.DOCTOR),
    validateRequest(CreateScheduleValidationZodSchema),
    ScheduleController.createSchedule,
);

export const ScheduleRoutes = router;