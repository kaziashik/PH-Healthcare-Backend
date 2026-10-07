import { z } from "zod";

export const ApplyAsDoctorValidationZodSchema = z.object({
	user: z.object({
		name: z.string().trim().min(2, "Name must be at least 2 characters long"),

		email: z.email("Invalid email address").trim().toLowerCase(),

		password: z
			.string()
			.min(8)
			.regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
			.regex(/[a-z]/, "Password must contain at least one lowercase letter.")
			.regex(/[0-9]/, "Password must contain at least one number.")
			.regex(
				/[^A-Za-z0-9]/,
				"Password must contain at least one special character.",
			),
	}),

	doctor: z.object({
		address: z
			.string()
			.trim()
			.min(5, "Address must be at least 5 characters long")
			.optional(),

		specialization: z.string().trim().min(2, "Specialization is required"),

		licenseNumber: z.string().trim().min(3, "License number is required"),

		qualifications: z.string().trim().min(2, "Qualifications are required"),

		// Handles converting incoming FormData strings like "12" into an integer number
		experienceYears: z
			.number()
			.int("Experience years must be an integer")
			.min(0, "Experience years cannot be negative"),

		bio: z
			.string()
			.trim()
			.max(1000, "Bio cannot exceed 1000 characters")
			.optional(),

		// Handles converting incoming FormData strings like "150.00" into a float number
		consultationFee: z
			.number()
			.min(0, "Consultation fee cannot be negative")
			.optional(),
		contactNumber: z
			.string()
			.trim()
			.min(5, "Contact number is invalid")
			.optional(),
	}),
});

export const ApproveDoctorValidationZodSchema = z.object({
	doctorId: z.string().min(1, "Doctor id is required"),
	verificationStatus: z.enum(
		["APPROVED", "REJECTED"],
		"Verification status must be APPROVED or REJECTED",
	),
	rejectionReason: z.string().trim().min(1).optional(),
});

export const VerifyDoctorEmailValidationZodSchema = z.object({
	email: z.email("Invalid email address").trim().toLowerCase(),
	otp: z.string().length(6, "OTP must be 6 digits"),
});

export const UpdateDoctorProfileValidationZodSchema = z.object({
	address: z
		.string()
		.trim()
		.min(5, "Address must be at least 5 characters long")
		.optional(),

	bio: z
		.string()
		.trim()
		.max(1000, "Bio cannot exceed 1000 characters")
		.optional(),

	consultationFee: z
		.number()
		.min(0, "Consultation fee cannot be negative")
		.optional(),

	contactNumber: z
		.string()
		.trim()
		.min(5, "Contact number is invalid")
		.optional(),
});