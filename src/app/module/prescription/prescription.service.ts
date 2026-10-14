import { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import { Prisma } from "../../../generated/prisma/client";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreatePrescriptionPayload } from "./prescription.interface";


const createPrescription = async (payload : ICreatePrescriptionPayload, user : RequestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const appointment = await prisma.apppointment.findUnique({
        where: { id: payload.appointmentId, doctorId : doctor.id },
        include: { patient: true },
    });

    if (!appointment) {
        throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Prescription Can Only Be Written For A Completed Appointment",
        );
    }

    if (appointment.prescriptionUrl) {
        throw new AppError(
            httpStatus.CONFLICT,
            "A Prescription Already Exists For This Appointment",
        );
    }

    const pdfDocument = new PDFDocument({ margin: 50 });

    const pdfChunks: Buffer[] = []

    pdfDocument.on("data", (chunk: Buffer) => {
        pdfChunks.push(chunk)
    })

    const pdfReadyPromise = new Promise<Buffer>((resolve) => {
        pdfDocument.on("end", () => {
            resolve(Buffer.concat(pdfChunks))
        })
    })

    //pdf contents

    pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
    pdfDocument.fontSize(14).text("Prescription", { align: "center" });
    pdfDocument.moveDown(2);

    pdfDocument.fontSize(12).text(`Patient Name: ${appointment.patient.name}`);
    pdfDocument.text(`Doctor Name: ${doctor.name}`);
    pdfDocument.text(`Specialization: ${doctor.specialization}`);
    pdfDocument.text(`Date: ${new Date().toDateString()}`);
    pdfDocument.moveDown();

    pdfDocument.fontSize(14).text("Findings");
    pdfDocument.fontSize(12).text(payload.findings);
    pdfDocument.moveDown();

    pdfDocument.fontSize(14).text("Medicines");
    pdfDocument.moveDown(0.5);

    for (let i = 0; i < payload.medicines.length; i++) {
        const medicine = payload.medicines[i];

        pdfDocument.fontSize(12).text(`${i + 1}. ${medicine.name}`);
        pdfDocument.text(`   Dosage: ${medicine.dosage}`);
        pdfDocument.text(`   Duration: ${medicine.duration}`);

        if (medicine.instructions) {
            pdfDocument.text(`   Instructions: ${medicine.instructions}`);
        }

        pdfDocument.moveDown(0.5);
    }


    pdfDocument.end();

    const pdfBuffer = await pdfReadyPromise;


    let uploadResult: UploadApiResponse | null = null;
    try {
        uploadResult = await new Promise<UploadApiResponse>(
            (resolve, reject) => {
                cloudinary.uploader
                    .upload_stream(
                        { resource_type: "raw", format: "pdf" },
                        (error, result) => {
                            if (error || !result) {
                                return reject(error ?? new Error("No Cloudinary result"));
                            }
                            resolve(result);
                        },
                    )
                    .end(pdfBuffer);
            },
        );
    } catch (error) {
        console.error("Prescription file upload failed", error);
    }

    const prescription = {
        findings: payload.findings,
        medicines: payload.medicines,
        writtenAt: new Date().toISOString(),
    };

    const updatedAppointment = await prisma.apppointment.update({
        where: { id: appointment.id },
        data: {
            prescription: prescription as Prisma.InputJsonValue,
            ...(uploadResult
                ? {
                    prescriptionUrl: uploadResult.secure_url,
                    prescriptionPublicId: uploadResult.public_id,
                }
                : {}),
        },
    });

    try {
        await transporter.sendMail({
            from: config.email_sender,
            to: appointment.patient.email,
            subject: "Your Prescription - PH Healthcare System",
            text: `Your prescription from ${doctor.name} is attached and is also saved on your appointment.`,
            attachments: [
                {
                    filename: "prescription.pdf",
                    content: pdfBuffer,
                },
            ],
        });
    } catch (error) {
        console.error("Prescription email failed", error);
    }

    return updatedAppointment
}


const getSinglePrescription = async (appointmentId: string, user: RequestUser) => {
    const appointment = await prisma.apppointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { id: true, name: true, userId: true } },
            doctor: { select: { id: true, name: true, userId: true } },
        },
    });

    if (!appointment) {
        throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
    }

    if (user.role === Role.PATIENT) {
        if (appointment.patient.userId !== user.userId) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "You Are Not Allowed To View This Appointment",
            );
        }
    }
    if (user.role === Role.DOCTOR) {
        if (appointment.doctor.userId !== user.userId) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "You Are Not Allowed To View This Appointment",
            );
        }
    }

    if (!appointment.prescriptionUrl) {
        throw new AppError(
            httpStatus.NOT_FOUND,
            "No Prescription Has Been Written Yet",
        );
    }

    return {
        appointment,
        prescription : appointment.prescriptionUrl
    }
}

export const PrescriptionServices = {
    createPrescription,
    getSinglePrescription
}