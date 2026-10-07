import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { UploadApiResponse } from "cloudinary";
import { DoctorVerificationStatus, Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { IApplyAsDoctorPayload, IApproveDoctorPayload, IUpdateDoctorProfilePayload, IVerifyDoctorEmailPayload } from "./doctor.interface";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import { redisClient } from "../../lib/redits";
import path from "path";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { RequestUser } from "../../middleware/checkAuth";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interfaces";

const applyAsDoctor = async (
  payload: IApplyAsDoctorPayload,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      email: payload.user.email,
    },
  });

  if (isUserExists) {
    throw new Error("User Already Exists With This Email");
  }

  const licenseTaken = await prisma.doctor.findUnique({
    where: { licenseNumber: payload.doctor.licenseNumber },
  });

  if (licenseTaken) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A Doctor Application Already Uses This License Number",
    );
  }

  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result returned from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(resume?.buffer);
    },
  );

  console.log({ resumeUploadResult });

  const additionalFilesUploadResults = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
            },

            async (error, result) => {
              if (error) {
                return reject(error);
              }

              if (!result) {
                return reject(new Error("No result returned from Cloudinary"));
              }

              resolve(result);
            },
          )
          .end(file.buffer);
      });
    }),
  );

  console.log({ additionalFilesUploadResults });

  const email = payload.user.email.trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(
    payload.user.password,
    Number(config.bcrypt_salt_rounds) || 8,
  );

  const expirationSeconds = 5 * 60;
  const otpKey = `doctor-application-otp:${email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();
  const applicationKey = `doctor-application-data:${email}`;

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  await redisClient.set(
    applicationKey,
    JSON.stringify({
      user: {
        name: payload.user.name,
        email,
        password: hashedPassword,
      },
      doctor: {
        ...payload.doctor,
        resume: resumeUploadResult.secure_url,
        resumePublicId: resumeUploadResult.public_id,
        additionalFiles: additionalFilesUploadResults.map((file) => ({
          url: file.secure_url,
          publicId: file.public_id,
        })),
      },
    }),
    {
      expiration: {
        type: "EX",
        value: expirationSeconds,
      },
    },
  );

  if (config.node_env === "development") {
    console.log(`[dev] OTP ${email}: ${otpValue}`);
  }

  const tempatePath = path.join(
    process.cwd(),
    "src/app/module/templates/registration-user-otp.ejs",
  );

  const templateData = {
  name: payload.user.name,
  email,
  otpvalue: otpValue,
  expirationSeconds: expirationSeconds / 60,
};

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Doctor Application - Email Verification",
    html,
  });

  return { email };
};

const verifyDoctorEmail=async (payload: IVerifyDoctorEmailPayload)=>{
	const otp=payload.otp;
	const email=payload.email.trim().toLowerCase();

	const existingUser=await prisma.user.findUnique({
		where: {email}
	})

    if (existingUser?.emailVerified && existingUser.role === Role.DOCTOR) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	if (existingUser && existingUser.role !== Role.DOCTOR) {
		throw new AppError(httpStatus.CONFLICT, "User Already Exists With This Email");
	}

	const otpKey = `doctor-application-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"OTP Expired. Your Application Window Has Closed, Please Apply Again.",
		);
	}

	if (String(redisOtp) !== String(otp)) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	const applicationKey = `doctor-application-data:${email}`;
	const redisApplication = await redisClient.get(applicationKey);

	if (existingUser?.role === Role.DOCTOR && !existingUser.emailVerified) {
		await redisClient.del(otpKey);
		const verifiedUser = await prisma.user.update({
			where: { id: existingUser.id },
			data: { emailVerified: true },
			omit: { password: true },
			include: { doctor: true },
		});
		return verifiedUser;
	}

	if (!redisApplication) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor Application Not Found. Please Apply Again.",
		);
	}

	const application = JSON.parse(redisApplication) as IApplyAsDoctorPayload & {
		doctor: IApplyAsDoctorPayload["doctor"] & {
			resume?: string;
			resumePublicId?: string;
			additionalFiles?: { url: string; publicId: string }[];
		};
	};

	const verifiedUser = await prisma.user.create({
		data: {
			name: application.user.name,
			email: application.user.email,
			password: application.user.password,
			role: Role.DOCTOR,
			emailVerified: true,
			needPasswordChange: false,
			doctor: {
				create: {
					name: application.user.name,
					email: application.user.email,
					address: application.doctor.address,
					specialization: application.doctor.specialization,
					licenseNumber: application.doctor.licenseNumber,
					qualifications: application.doctor.qualifications,
					experienceYears: Number(application.doctor.experienceYears),
					bio: application.doctor.bio,
					consultationFee: application.doctor.consultationFee,
					contactNumber: application.doctor.contactNumber,
					resume: application.doctor.resume,
					resumePublicId: application.doctor.resumePublicId,
					additionalFiles: application.doctor.additionalFiles,
					verificationStatus: DoctorVerificationStatus.PENDING,
				},
			},
		},
		omit: { password: true },
		include: { doctor: true },
	});

	await redisClient.del([otpKey, applicationKey]);

	return verifiedUser
}


const approveDoctor = async (payload : IApproveDoctorPayload, reviewer : RequestUser) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;

	const existingDoctor = await prisma.doctor.findUnique({
		where: { id: doctorId },
		include: { user: true },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Application Not Found");
	}

	if (existingDoctor.isDeleted) {
		throw new AppError(httpStatus.GONE, "Doctor Application Has Been Deleted");
	}

	if (!existingDoctor.user.emailVerified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
		);
	}

	if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === DoctorVerificationStatus.REJECTED &&
		!rejectionReason
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Rejection Reason Is Required When Rejecting A Doctor Application",
		);
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: doctorId },
		data: {
			verificationStatus,
			rejectionReason:
				verificationStatus === DoctorVerificationStatus.REJECTED
					? rejectionReason
					: null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
	});

	const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

	const templatePath = path.join(
  process.cwd(),
  `src/app/module/templates/${
    isApproved
      ? "doctor-application-approved.ejs"
      : "doctor-application-rejected.ejs"
  }`,
);

const templateData = {
  name: updatedDoctor.name,
  reason: updatedDoctor.rejectionReason,
};

const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: updatedDoctor.email,
		subject: isApproved
			? "Your Doctor Application Has Been Approved"
			: "Your Doctor Application Has Been Rejected",
		html,
	});

	return updatedDoctor

}

const getAllDoctors = async (query: IQuery, user?: RequestUser) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const isManager = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

	const andConditions: DoctorWhereInput[] = []

	//Searching
	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ email: { contains: query.searchTerm, mode: "insensitive" } },
				{
					specialization: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					licenseNumber: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	//filtering
	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	if (query.email) {
		andConditions.push({
			email: { contains: query.email, mode: "insensitive" },
		});
	}

	if (query.licenseNumber) {
		andConditions.push({
			licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
		});
	}

	if (query.verificationStatus && isManager) {
		andConditions.push({
			verificationStatus: query.verificationStatus as DoctorVerificationStatus,
		});
	}

	andConditions.push({ isDeleted: false });

	if (!isManager) {
		andConditions.push({ verificationStatus: DoctorVerificationStatus.APPROVED });
		andConditions.push({
			user: {
				status: UserStatus.ACTIVE,
				isDeleted: false,
				emailVerified: true,
			},
		});
	}

	const allDoctors = await prisma.doctor.findMany({
		where : {
			AND : andConditions.length > 0 ? andConditions : undefined
		},

		take: limit,
		skip: skip,


		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder
		},

		include:{
			user: {
				omit:{
					password: true
				}
			},

			// schedules: true,
			// appointments: true
			// prescriptions: true
		}

	});

	const totalDoctorCount = await prisma.doctor.count({
		where: {
			AND: andConditions
		}
	})

	return {
		data: allDoctors,
		meta: {
			page: page,
			limit: limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit)
		}
	}
}

const updateDoctorProfile = async (payload : IUpdateDoctorProfilePayload, user : RequestUser) => {
	const existingDoctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: existingDoctor.id },
		data: payload,
	});

	return updatedDoctor;

}

export const DoctorServices = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctors,
  updateDoctorProfile
};
