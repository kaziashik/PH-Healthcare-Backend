import httpStatus from "http-status";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { AppError } from "../../utils/AppError";

export interface IContactMessage {
	name: string;
	email: string;
	subject: string;
	message: string;
}

const sendContactMessage = async (payload: IContactMessage) => {
	try {
		await transporter.sendMail({
			from: config.email_sender,
			to: config.email_sender,
			replyTo: payload.email,
			subject: `Clinic message: ${payload.subject}`,
			text: `${payload.name} <${payload.email}>\n\n${payload.message}`,
		});
	} catch {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"The clinic inbox could not accept this message. Try again shortly.",
		);
	}

	return { accepted: true };
};

export const ContactServices = {
	sendContactMessage,
};
