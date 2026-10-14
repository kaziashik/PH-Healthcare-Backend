import { addMinutes, isBefore, subHours } from "date-fns";
import httpStatus from "http-status";
import {
	AppointmentStatus,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import { ApppointmentWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { IQuery } from "../../interfaces";
import { getBkashIdToken } from "../../lib/bkash";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { buildAppointmentInvoicePdf } from "../../utils/appointment-invoice";
import { AppError } from "../../utils/AppError";
import { IBookAppointmentPayload, ICancelAppointmentPayload, IPayAppointmentPayload, IUpdateAppointmentStatusPayload } from "./appointment.interface";

const bookAppointment = async (payload: IBookAppointmentPayload , user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		// business logic

		const patient = await tx.patient.findUnique({
			where: { userId: user.userId },
		});

		if (!patient) {
			throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
		}

		const schedule = await tx.schedule.findUnique({
			where: { id: payload.scheduleId },
			include: { doctor: true },
		});

		if (!schedule || schedule.isDeleted) {
			throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
		}

		if (schedule.status !== ScheduleStatus.PUBLISHED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Published Yet",
			);
		}

		const now = new Date()
		const serialNumber = payload.serialNumber;

		if (
			!Number.isInteger(serialNumber) ||
			serialNumber < 1 ||
			serialNumber > schedule.totalSlots
		) {
			throw new AppError(httpStatus.BAD_REQUEST, "This Time Is Not On The Schedule");
		}

		const joiningTime = addMinutes(
			schedule.startDateTime,
			(serialNumber - 1) * 20,
		);

		if(!isBefore(now, joiningTime)){
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Time Has Already Started",
			);
		}
		// if(isAfter(now, schedule.startDateTime)){
		// 	throw new AppError(
		// 		httpStatus.BAD_REQUEST,
		// 		"This Schedule Has Already Started",
		// 	);
		// }

		const existingAppointment = await tx.apppointment.findFirst({
			where : {
				patientId : patient.id,
				scheduleId : schedule.id,
			}
		})

		if(
			existingAppointment?.status === AppointmentStatus.BOOKED ||
			existingAppointment?.status === AppointmentStatus.CONFIRMED
		){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Booked Appointment.")
		}
		if(existingAppointment?.status === AppointmentStatus.ONGOING){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Ongoing Appointment")
		}
		if(existingAppointment?.status === AppointmentStatus.COMPLETED){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day")
		}

		await tx.$queryRaw`SELECT "id" FROM "schedules" WHERE "id" = ${schedule.id} FOR UPDATE`;

		const holdAfter = new Date(now.getTime() - 5 * 60 * 1000);
		const takenSlot = await tx.apppointment.findFirst({
			where: {
				scheduleId: schedule.id,
				serialNumber,
				...(existingAppointment ? { id: { not: existingAppointment.id } } : {}),
				OR: [
					{
						status: {
							in: [
								AppointmentStatus.BOOKED,
								AppointmentStatus.CONFIRMED,
								AppointmentStatus.ONGOING,
								AppointmentStatus.COMPLETED,
							],
						},
					},
					{
						status: AppointmentStatus.PENDING,
						updatedAt: { gte: holdAfter },
					},
				],
			},
		});

		if (takenSlot) {
			throw new AppError(httpStatus.BAD_REQUEST, "This Time Is Already Taken");
		}

		await tx.apppointment.updateMany({
			where: {
				scheduleId: schedule.id,
				serialNumber,
				status: AppointmentStatus.CANCELLED,
			},
			data: {
				serialNumber: null,
				joiningTime: null,
			},
		});

		const alreadyHoldingThisSerial =
			existingAppointment?.status === AppointmentStatus.PENDING &&
			existingAppointment.serialNumber === serialNumber;
		const holdingAnotherSerial =
			existingAppointment?.status === AppointmentStatus.PENDING &&
			existingAppointment.serialNumber != null &&
			existingAppointment.serialNumber !== serialNumber;

		if (
			holdingAnotherSerial &&
			schedule.availableSlots < schedule.totalSlots
		) {
			await tx.schedule.update({
				where: { id: schedule.id },
				data: { availableSlots: { increment: 1 } },
			});
		}

		if (!alreadyHoldingThisSerial) {
			const slotUpdate = await tx.schedule.updateMany({
				where: {
					id: schedule.id,
					availableSlots: { gt: 0 },
				},
				data: { availableSlots: { decrement: 1 } },
			});

			if (slotUpdate.count === 0) {
				throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
			}
		}

		if(!schedule.doctor.consultationFee){
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Doctor Has Not Set A Consultation Fee Yet",
			);
		}

		const amount = schedule.doctor.consultationFee.toString();

		const appointment = existingAppointment?.status === AppointmentStatus.CANCELLED
			? await tx.apppointment.update({
				where: { id: existingAppointment.id },
				data: {
					status: AppointmentStatus.PENDING,
					serialNumber,
					joiningTime,
				},
			})
			: await tx.apppointment.create({
				data: {
					status: AppointmentStatus.PENDING,
					serialNumber,
					joiningTime,
					patientId : patient.id,
					doctorId : schedule.doctor.id,
					scheduleId : schedule.id
				},
			});

		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
		}

		const bkashCreatePaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/create`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					mode: "0011",
					// payerReference: "0123456789", //user email or phone number
					payerReference: user.email, //user email or phone number
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					amount: amount,
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "Inv4" // apppointment id
					merchantInvoiceNumber: appointment.id, // apppointment id
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

		//paymen model create

		const existingPayment = await tx.payment.findUnique({
			where: { appointmentId: appointment.id },
		});

		if (existingPayment) {
			await tx.payment.update({
				where: { appointmentId: appointment.id },
				data: {
					status: PaymentStatus.UNPAID,
					merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
					amount: amount,
					gatewayResponse: bkashCreatePaymentResult,
					bkashPaymentId: bkashCreatePaymentResult.paymentID,
					payerReference: user.email,
					bkashTrxId: null,
					paidAt: null,
					refundTrxId: null,
					refundAmount: null,
					refundReason: null,
					refundedAt: null,
				},
			});
		} else {
			await tx.payment.create({
				data: {
					merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
					appointmentId: appointment.id,
					amount: amount,
					gatewayResponse: bkashCreatePaymentResult,
					bkashPaymentId: bkashCreatePaymentResult.paymentID,
					payerReference: user.email,
				},
			});
		}

		return {
			paymentUrl: bkashCreatePaymentResult.bkashURL,
		};
	});

	return transactionResult;
};

const payAppointment = async (payload: IPayAppointmentPayload, user: RequestUser) => {
	const appointmentId = payload.appointmentId;

	const existingAppointment = await prisma.apppointment.findUnique({
		where: {
			id: appointmentId,
		},
		include : {
			patient: true,
			schedule : {
				include : {
					doctor : true
				}
			}
		}
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
	}

	if (existingAppointment.patient.userId !== user.userId) {
		throw new AppError(httpStatus.FORBIDDEN, "You Are Not Allowed To Pay For This Appointment");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Not Pending!");
	}

	// if (existingAppointment.status === "CANCELLED" || existingAppointment.status === "ONGOING" || existingAppointment.status === "COMPLETED"){
	//     const appointmentStatus = existingAppointment.status
	//     throw new Error(`Appointment is already ${appointmentStatus.toLowerCase}`)
	// }

	if (!existingAppointment.schedule.doctor.consultationFee){
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Set A Consultation Fee Yet",
		);
	}


	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
	}

	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				// payerReference: "0123456789", //user email or phone number
				payerReference: user.email, //user email or phone number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				amount: amount,
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv4" // apppointment id
				merchantInvoiceNumber: existingAppointment.id, // apppointment id
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	await prisma.payment.update({
		where: {
			appointmentId: existingAppointment.id,
		},

		data: {
			merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
			gatewayResponse: bkashCreatePaymentResult,
			bkashPaymentId: bkashCreatePaymentResult.paymentID,
		},
	});

	return {
		paymentUrl: bkashCreatePaymentResult.bkashURL,
	};
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;

		if (!paymentId) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
		}

		const status = query.status;

		if (!status) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
		}

		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
		}

		const executedPaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/execute`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},

				body: JSON.stringify({
					paymentID: paymentId,
				}),
			},
		);

		const executedPaymentResult = await executedPaymentResponse.json();

		if (status === "success") {

			const appointment = await tx.apppointment.findUnique({
				where : {
					id: executedPaymentResult.merchantInvoiceNumber
				},
				include : {
					schedule : true,
					patient : true,
					doctor : true
				}
			});

			if(!appointment){
				throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!")
			}

			if (
				appointment.status === AppointmentStatus.BOOKED ||
				appointment.status === AppointmentStatus.CONFIRMED
			) {
				return {
					redirectUrl: `${config.frontend_url}/patient/appointments?status=success`,
				};
			}



			

			// total slot = 3 , available slot = 2
			// (total - available) + 1

			let serialNumber = appointment.serialNumber;
			let joiningTime = appointment.joiningTime;

			await tx.$queryRaw`SELECT "id" FROM "schedules" WHERE "id" = ${appointment.schedule.id} FOR UPDATE`;

			if (serialNumber && joiningTime) {
				await tx.apppointment.update({
					where: {
						id: executedPaymentResult.merchantInvoiceNumber,
					},
					data: {
						status: AppointmentStatus.BOOKED,
						serialNumber,
						joiningTime,
					},
				});
			} else {
			const takenSlots = await tx.apppointment.findMany({
				where: {
					scheduleId: appointment.schedule.id,
					serialNumber: { not: null },
					status: {
						in: [
							AppointmentStatus.BOOKED,
							AppointmentStatus.CONFIRMED,
							AppointmentStatus.ONGOING,
							AppointmentStatus.COMPLETED,
						],
					},
				},
				select: { serialNumber: true },
			});

			const takenSerials = new Set(takenSlots.map((slot) => slot.serialNumber));
			serialNumber = null;

			for (let slot = 1; slot <= appointment.schedule.totalSlots; slot++) {
				if (!takenSerials.has(slot)) {
					serialNumber = slot;
					break;
				}
			}

			if (!serialNumber) {
				throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
			}

			// 25 August => 3:00 PM - 4:00 PM
			// 1st person joining time => startDateTime = 2026-08-25T15:00:00.436Z => 3:00 PM
			// serial number (1) - 1 * 20 => 0 minues

			// 2nd person joining time => startDateTime = 2026-08-25T15:20:00.436Z => 3:00 PM
			// serial number (2) - 1 * 20 => 20 minutes


			// 3nd person joining time => startDateTime = 2026-08-25T15:40:00.436Z => 3:00 PM
			// serial number (3) - 1 * 20 => 40 mintes

			joiningTime = addMinutes(
				appointment.schedule.startDateTime, 
				(serialNumber - 1) * 20
			)

			await tx.apppointment.updateMany({
				where: {
					scheduleId: appointment.schedule.id,
					serialNumber,
					status: AppointmentStatus.CANCELLED,
				},
				data: {
					serialNumber: null,
					joiningTime: null,
				},
			});

			const slotUpdate = await tx.schedule.updateMany({
				where: {
					id: appointment.schedule.id,
					availableSlots: { gt: 0 },
				},
				data: {
					availableSlots: { decrement: 1 },
				},
			});

			if (slotUpdate.count === 0) {
				throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
			}

			await tx.apppointment.update({
				where: {
					id: executedPaymentResult.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.BOOKED,
					joiningTime,
					serialNumber
				},
			});
			}

			await tx.payment.update({
				where: {
					appointmentId: executedPaymentResult.merchantInvoiceNumber,
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: executedPaymentResult.trxID,
					paidAt: executedPaymentResult.paymentExecuteTime,
					gatewayResponse: executedPaymentResult,
				},
			});

			const pdfBuffer = await buildAppointmentInvoicePdf({
				patientName: appointment.patient?.name ?? "",
				patientEmail: appointment.patient?.email ?? "",
				doctorName: appointment.doctor?.name ?? "",
				specialization: appointment.doctor?.specialization ?? "",
				appointmentDate: appointment.schedule.startDateTime.toDateString(),
				joiningTime: joiningTime?.toString() ?? "",
				serialNumber: String(serialNumber ?? ""),
				meetingLink: appointment.schedule.meetingLink,
				amount: String(executedPaymentResult.amount),
				transactionId: executedPaymentResult.trxID,
				paidAt: String(executedPaymentResult.paymentExecuteTime),
			});

			await transporter.sendMail({
				from: config.email_sender,
				to: appointment.patient.email,
				subject: "Your Appointment Invoice - PH Healthcare System",
				text: "Thank you for booking an appointment. Please find your invoice attached.",
				attachments : [
					{
						filename: "invoice.pdf",
						content : pdfBuffer
					}
				]
			})

			return {
				redirectUrl: `${config.frontend_url}/patient/appointments?status=success`,
			};
		} else if (status === "failure") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.FAILED,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/patient/appointments?status=failure`,
			};
		} else if (status === "cancel") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.CANCELLED,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				executedPaymentResult,
				redirectUrl: `${config.frontend_url}/patient/appointments?status=cancel`,
			};
		} else {
			return {
				executedPaymentResult,
				redirectUrl: `${config.frontend_url}/patient/appointments?error=payment-failed`,
			};
		}
	}, {
		maxWait: 10000, // default: 2000
		timeout: 30000, // default: 5000
	});

	return transactionResult;
};

const cancelAppointment = async (payload: ICancelAppointmentPayload, user : RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const existingAppointment = await tx.apppointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payment: true,
				schedule : true,
				patient: true,
			},
		});

		if (!existingAppointment) {
			throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
		}

		if (
			user.role === Role.PATIENT &&
			existingAppointment.patient.userId !== user.userId
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To Cancel This Appointment",
			);
		}

		if (existingAppointment.status === "CANCELLED") {
			throw new AppError(httpStatus.BAD_REQUEST, "Appointment Already Cancelled");
		}

		const heldASlot = existingAppointment.serialNumber != null;

		const updatedAppointment = await tx.apppointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: AppointmentStatus.CANCELLED,
				serialNumber: null,
				joiningTime: null,
			},
		});

		if (
			heldASlot &&
			existingAppointment.schedule.availableSlots < existingAppointment.schedule.totalSlots
		) {
			await tx.schedule.update({
				where : {
					id : existingAppointment.schedule.id
				},
				data : {
					availableSlots : {increment : 1}
				}
			})
		}

		// refund process
		const now = new Date();
		const startDateTime = existingAppointment.schedule.startDateTime; // 25 August : 3:00 PM

		// After 2:00 Pm => no refund
		// must cancel before  2:00 PM
		const refundCutOffTime = subHours(startDateTime, 1)

		// now >  refuncCutOff Time => no refund
		// now < refundCutOff Time => refund eligible
		const isEligibleForRefund = isBefore(now, refundCutOffTime)

		if(isEligibleForRefund && existingAppointment.payment?.status === PaymentStatus.PAID){

			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
			}

			const bkashRefundPaymentResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/payment/refund`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						Authorization: bkashIdToken,
						"X-App-Key": config.bkash_app_key,
					},
					body: JSON.stringify({
						paymentID: existingAppointment.payment?.bkashPaymentId,
						trxID: existingAppointment.payment?.bkashTrxId,
						amount: existingAppointment.payment?.amount.toString(),
						sku: "Appointment Cancellation",
						reason: "Patient Cancelled The Appointment",
					}),
				},
			);

			const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

			await tx.payment.update({
				where: {
					appointmentId: existingAppointment.id,
				},
				data: {
					refundTrxId: bkashRefundPaymentResult.refundTrxID,
					refundedAt: bkashRefundPaymentResult.completedTime,
					refundAmount: bkashRefundPaymentResult.amount,
					refundReason: "Patient Cancelled The Appointment",
					status: PaymentStatus.REFUNDED,
					gatewayResponse: bkashRefundPaymentResult,
				},
			});

		}

		const newPaymentInfo = await tx.payment.findUnique({
			where: {
				appointmentId: existingAppointment.id,
			},
		})


		

		return {
			appointment: updatedAppointment,
			payment: newPaymentInfo,
		};
	});

	return transactionResult;
};

// DOCTOR ONLY CONFIRMED => ONGOING => COMPLETED
const updateAppointmentStatus = async (
	appointmentId : string,
	payload : IUpdateAppointmentStatusPayload,
	user : RequestUser
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const appointment = await prisma.apppointment.findUnique({
		where: { id: appointmentId, doctorId : doctor.id },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(appointment.status === AppointmentStatus.COMPLETED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already completed")
	}

	if(appointment.status === AppointmentStatus.CANCELLED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already cancelled")
	}
	if(appointment.status === AppointmentStatus.PENDING){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is Pending. You can change the status after appointment is confirmed")
	}

	if(
		appointment.status === AppointmentStatus.BOOKED ||
		appointment.status === AppointmentStatus.CONFIRMED
	){

		if(payload.status !== "ONGOING"){
			throw new AppError(httpStatus.BAD_REQUEST, "Confirmed Appointment Must Be Ongoing At First")
		}

		await prisma.apppointment.update({
			where : {
				id : appointment.id
			},
			data : {
				status : AppointmentStatus.ONGOING
			}
		})


	}

	if(appointment.status === AppointmentStatus.ONGOING){

		if(payload.status !== "COMPLETED"){
			throw new AppError(httpStatus.BAD_REQUEST, "Ongoinf Appointment Must Be Complted.")
		}

		await prisma.apppointment.update({
			where: {
				id: appointment.id
			},
			data: {
				status: AppointmentStatus.COMPLETED
			}
		})
	}

	const updatedAppointment = await prisma.apppointment.findUnique({
		where : {
			id : appointment.id
		}
	})

	return updatedAppointment
}

const withPatientMeetingLink = <
	T extends {
		status: AppointmentStatus;
		payment: { status: PaymentStatus } | null;
		schedule: { meetingLink: string } | null;
	},
>(
	appointment: T,
): T => {
	const paid =
		appointment.payment?.status === PaymentStatus.PAID &&
		appointment.status !== AppointmentStatus.PENDING &&
		appointment.status !== AppointmentStatus.CANCELLED;

	if (paid || !appointment.schedule) {
		return appointment;
	}

	return {
		...appointment,
		schedule: {
			...appointment.schedule,
			meetingLink: "",
		},
	};
};

//patient appointments
const getMyAppointments = async (query : IQuery, user : RequestUser) => {


	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			patientId : patient.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			doctor: {
				select: {
					id: true,
					name: true,
					specialization: true,
					user: { select: { imageUrl: true } },
				},
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments.map(withPatientMeetingLink),
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

//doctor appointments
const getDoctorAppointments = async (query: IQuery, user: RequestUser) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			doctorId : doctor.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		orderBy: { [sortBy] : sortOrder},
		include: {
			patient: {
				select: {
					id: true,
					name: true,
					email: true,
					contactNumber: true,
					user: { select: { imageUrl: true } },
				},
			},
			schedule: true,
			payment: true,
		},
	});

	const statusRank: Record<string, number> = {
		ONGOING: 0,
		BOOKED: 1,
		CONFIRMED: 1,
		PENDING: 2,
		COMPLETED: 3,
		CANCELLED: 4,
	};

	const ordered = [...appointments].sort((left, right) => {
		const rank =
			(statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9);
		if (rank !== 0) {
			return rank;
		}
		const leftTime = left.joiningTime?.getTime() ?? left.createdAt.getTime();
		const rightTime = right.joiningTime?.getTime() ?? right.createdAt.getTime();
		return rightTime - leftTime;
	});
	const visible = ordered.slice(skip, skip + limit);
	const total = ordered.length;

	return {
		data: visible,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

//admin super admin
const getAllAppointments = async (query : IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const andConditions: ApppointmentWhereInput[] = [];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.doctorId) {
		andConditions.push({ doctorId: query.doctorId });
	}

	if (query.patientId) {
		andConditions.push({ patientId: query.patientId });
	}

	if(query.doctorEmail){
		andConditions.push({
			doctor : {
				email : query.doctorEmail
			}
		})
	}
	if(query.patientEmail){
		andConditions.push({
			patient : {
				email : query.patientEmail
			}
		})
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder },
		include: {
			patient: { select: { id: true, name: true, email: true } },
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

// for all loggedin user
const getSingleAppointment = async (appointmentId : string, user : RequestUser) => {
	const appointment = await prisma.apppointment.findUnique({
		where: { id: appointmentId },
		include: {
			patient: { select: { id: true, name: true, email: true, userId: true } },
			doctor: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(user.role === Role.PATIENT){
		if(appointment.patient.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}
	if(user.role === Role.DOCTOR){
		if(appointment.doctor.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}

	if (user.role === Role.PATIENT) {
		return withPatientMeetingLink(appointment);
	}

	return appointment
}

export const AppointmentServices = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};
