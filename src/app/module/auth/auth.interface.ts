import z from "zod";
import { Role } from "../../../generated/prisma/browser";

export interface ILoginUserPayload {
  email: string;
  password: string;
}

export interface IRegisterPatientPayload {
  name: string;
  email: string;
  password: string;
  patient?: {
    contactNumber?: string;
    gender?: "MALE" | "FEMALE" | "OTHER";
    dateOfBirth?: Date | string;
    bloodGroup?: string;
    medicalHistory?: string;
  };
}
export interface IVerifyEmailPayload {
  email: string;
  otp: string;
}

export interface IRequestUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}
export interface IGoogleLoginPayload {
  idToken: string;
}

export interface IForgotPasswordPayload {
  email: string;
}

export interface IResetPasswordPayload {
  email: string;
  newPassword: string;
  otp: string;
}

export interface IChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ISetPasswordPayload {
  newPassword: string;
}
