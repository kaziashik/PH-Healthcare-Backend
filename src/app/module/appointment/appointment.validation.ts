import z from "zod";

export const BookAppointmentValidationZodSchema = z.object({
    scheduleId: z.string().min(1, "Schedule Id Is Required"),
    serialNumber: z.number().int().positive("Choose A Time"),
});

export const PayAppointmentValidationZodSchema = z.object({
    appointmentId: z.string().min(1, "Appointment Id Is Required"),
});

export const CancelAppointmentValidationZodSchema = z.object({
    appointmentId: z.string().min(1, "Appointment Id Is Required"),
});

export const UpdateAppointmentStatusValidationZodSchema = z.object({
    status: z.enum(
        ["ONGOING", "COMPLETED"],
        "Status Must Be Either ONGOING Or COMPLETED",
    ),
});
