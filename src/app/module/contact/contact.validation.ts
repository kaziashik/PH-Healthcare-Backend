import z from "zod";

export const ContactMessageValidationZodSchema = z.object({
	name: z.string().trim().min(2, "Name must be at least 2 characters long"),
	email: z.email("Please enter a valid email address"),
	subject: z.string().trim().min(5, "Subject must be at least 5 characters long"),
	message: z
		.string()
		.trim()
		.min(20, "Message must be at least 20 characters long"),
});
