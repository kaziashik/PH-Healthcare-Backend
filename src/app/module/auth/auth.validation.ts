import z, { email } from "zod";

const PatientRegistrationZodSchema = z.object({
  name: z.string().min(3).max(10),
  email: z.email(),
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
  patient: z
    .object({
      contactNumber: z.string().optional(),
      gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
      dateOfBirth: z.coerce.date().optional(),
      bloodGroup: z.string().trim().optional(),
      medicalHistory: z.string().trim().optional(),
    })
    .optional(),
});

  const PatientEmailVerifyZodSchema = z.object({
    
    email: z.email("Not email!!"),
     otp: z.string().length(6)
   
})


const LoginZodSchema= z.object({
  email: z.email(),
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
});

const ForgetPasswordZodSchema=z.object({
  email: z.email()
});


const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character.",
  );

const ChangePasswordZodSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

const SetPasswordZodSchema = z.object({
  newPassword: passwordSchema,
});

const ResetPasswordZodSchema=z.object({
  email: z.email(),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character.",
    ),
    otp: z.string().length(6)
});


export const userValidation = {
  PatientRegistrationZodSchema,
  PatientEmailVerifyZodSchema,
  LoginZodSchema,
  ForgetPasswordZodSchema,
  ResetPasswordZodSchema,
  ChangePasswordZodSchema,
  SetPasswordZodSchema,
};
