import { z } from "zod";

export const CreateManagedAccountZodSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters long"),
  organizationEmail: z.email("Invalid organization email").trim().toLowerCase(),
  personalEmail: z.email("Invalid personal email").trim().toLowerCase(),
  contactNumber: z.string().trim().min(5, "Contact number is invalid").optional(),
  address: z.string().trim().min(5, "Address must be at least 5 characters long").optional(),
});

export const UpdateAccountStatusZodSchema = z.object({
  userId: z.string().min(1, "User id is required"),
  status: z.enum(["ACTIVE", "BLOCKED"], "Status must be ACTIVE or BLOCKED"),
});
