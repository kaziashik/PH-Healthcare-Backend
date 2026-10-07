import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { ContactController } from "./contact.controller";
import { ContactMessageValidationZodSchema } from "./contact.validation";

const router = Router();

router.post(
	"/",
	validateRequest(ContactMessageValidationZodSchema),
	ContactController.sendContactMessage,
);

export const ContactRoutes = router;
