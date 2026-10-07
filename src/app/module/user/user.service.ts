import bcrypt from "bcryptjs";
import { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { IQuery } from "../../interfaces";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateManagedAccountPayload, IUpdateAccountStatusPayload } from "./user.interface";


const updateProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      image_PublicId: true,
      imageUrl: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, rejects) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
        },

        async (error, result) => {
          if (error) {
            return rejects(error);
          }
          if (!result) {
            return rejects(new Error("No result returned from Cloudinary"));
          }
          resolve(result);
        },
      )
      .end(buffer)
    },
    
  );

  const updatedUser= await prisma.user.update({
    where: {
        id: userId
    },
    data: {
        imageUrl: cloudinaryResult.secure_url,
        image_PublicId: cloudinaryResult.public_id
    },
    omit: {
        password: true,
    }
  });
  if(currentUser?.image_PublicId && currentUser.imageUrl){
    await cloudinary.uploader.destroy(currentUser.image_PublicId)
  }
  return updatedUser;
};

const generatePassword = () => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];

  while (chars.length < 12) {
    chars.push(pick(all));
  }

  for (let index = chars.length - 1; index > 0; index--) {
    const swapIndex = crypto.randomInt(index + 1);
    const current = chars[index];
    chars[index] = chars[swapIndex];
    chars[swapIndex] = current;
  }

  return chars.join("");
};

const createManagedAccount = async (
  payload: ICreateManagedAccountPayload,
  role: typeof Role.ADMIN | typeof Role.SUPER_ADMIN,
  actor: RequestUser,
) => {
  if (role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only A Super Admin Can Create A Super Admin",
    );
  }

  const organizationEmail = payload.organizationEmail.trim().toLowerCase();
  const personalEmail = payload.personalEmail.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: organizationEmail },
  });

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "User with this email already exists");
  }

  const plainPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(
    plainPassword,
    Number(config.bcrypt_salt_rounds) || 8,
  );

  const createdUser = await prisma.user.create({
    data: {
      name: payload.name,
      email: organizationEmail,
      password: hashedPassword,
      role,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      needPasswordChange: true,
      admin: {
        create: {
          name: payload.name,
          organizationEmail,
          personalEmail,
          contactNumber: payload.contactNumber,
          address: payload.address,
        },
      },
    },
    omit: { password: true },
    include: { admin: true },
  });

  try {
    const templatePath = path.join(
      process.cwd(),
      "src/app/module/templates/admin-account-created.ejs",
    );
    const html = await ejs.renderFile(templatePath, {
      name: payload.name,
      organizationEmail,
      password: plainPassword,
    });

    await transporter.sendMail({
      from: config.email_sender,
      to: personalEmail,
      subject: "Your PH Healthcare System Account",
      html,
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: createdUser.id } });
    throw error;
  }

  return createdUser;
};

const updateAccountStatus = async (
  payload: IUpdateAccountStatusPayload,
  actor: RequestUser,
) => {
  if (payload.status !== UserStatus.ACTIVE && payload.status !== UserStatus.BLOCKED) {
    throw new AppError(httpStatus.BAD_REQUEST, "Status Must Be ACTIVE Or BLOCKED");
  }

  const target = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!target || target.isDeleted || target.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.NOT_FOUND, "Account Not Found");
  }

  if (target.id === actor.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Cannot Change Your Own Account Status");
  }

  const isStaff = target.role === Role.ADMIN || target.role === Role.SUPER_ADMIN;

  if (isStaff && actor.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only A Super Admin Can Block Or Unblock An Admin Or Super Admin",
    );
  }

  if (!isStaff && target.role !== Role.DOCTOR && target.role !== Role.PATIENT) {
    throw new AppError(httpStatus.BAD_REQUEST, "This Account Cannot Be Managed");
  }

  const updatedUser = await prisma.user.update({
    where: { id: target.id },
    data: { status: payload.status },
    omit: { password: true },
    include: {
      patient: true,
      doctor: true,
      admin: true,
    },
  });

  return updatedUser;
};

const listByRole = async (query: IQuery, roles: Role[]) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: {
    role?: { in: Role[] } | Role;
    isDeleted?: boolean;
    status?: UserStatus;
    OR?: object[];
  }[] = [
    { role: { in: roles } },
    { isDeleted: false },
  ];

  if (query.status) {
    andConditions.push({ status: query.status as UserStatus });
  }

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { email: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  const data = await prisma.user.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    omit: { password: true },
    include: {
      patient: true,
      doctor: true,
      admin: true,
    },
  });

  const total = await prisma.user.count({ where: { AND: andConditions } });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getPatients = async (query: IQuery) => listByRole(query, [Role.PATIENT]);

const getAdmins = async (query: IQuery) => listByRole(query, [Role.ADMIN, Role.SUPER_ADMIN]);

export const userService = {
  updateProfileImage,
  createManagedAccount,
  updateAccountStatus,
  getPatients,
  getAdmins,
};
