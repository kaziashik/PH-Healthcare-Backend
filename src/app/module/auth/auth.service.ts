import bcrypt from "bcryptjs";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  Role,
  UserStatus,
  AuthProvider,
  DoctorVerificationStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import { googleClient } from "../../lib/googleAuth";
import type { TokenPayload } from "google-auth-library";
import crypto from "crypto";
import path from "path";
import ejs from "ejs";
import {
  IForgotPasswordPayload,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IChangePasswordPayload,
  IResetPasswordPayload,
  ISetPasswordPayload,
  IVerifyEmailPayload,
} from "./auth.interface";
import { redisClient } from "../../lib/redits";
import { transporter } from "../../lib/nodemailer";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientData } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const expirationSeconds = 5 * 60;

  const otpkey = `patient-registration-otp:${email}`;
  const otpvalue = crypto.randomInt(100000, 1000000).toString();

 if(config.node_env==="development"){
  console.log(`[dev] OTP ${email}: ${otpvalue}`);
 }


  await redisClient.set(otpkey, otpvalue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const hashedPassword = await bcrypt.hash(password, 8);

  const patientRegistrationKey = `patient-registration-data:${email}`;
  const redisUserDataPayload = {
    name,
    email,
    password: hashedPassword,
    patient: patientData,
  };

  await redisClient.set(
    patientRegistrationKey,
    JSON.stringify(redisUserDataPayload),
    {
      expiration: {
        type: "EX",
        value: expirationSeconds,
      },
    },
  );

  const tempatePath = path.join(
    process.cwd(),
    "src/app/module/templates/registration-user-otp.ejs",
  );
  const templateData = {
    name,
    email,
    otpvalue,
    expirationSeconds: expirationSeconds / 60,
  };
  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Verify your email",
    // text: `Your OTP is ${otp}`,

    // html : `<h1>Your password is changed <h1>`
    html,
  });
};

//   const createdUser = await prisma.user.create({
//     data: {
//       name,
//       email,
//       password: hashedPassword,
//       role: Role.PATIENT,
//       status: UserStatus.ACTIVE,
//       emailVerified: false,
//       patient: {
//         create: {
//           name,
//           email,
//           contactNumber: patientData?.contactNumber || " ",
//         },
//       },
//     },
//     omit: { password: true },
//     include: { patient: true },
//   });

//   const { patient, ...user } = createdUser;
//   const jwtPayload = {
//     userId: user.id,
//     name: user.name,
//     email: user.email,
//     role: user.role,
//   };

//   const accessToken = jwtUtils.createToken(
//     jwtPayload,
//     config.jwt_access_secret,
//     config.jwt_access_expires_in as SignOptions,
//   );

//   const refreshToken = jwtUtils.createToken(
//     jwtPayload,
//     config.jwt_refresh_secret,
//     config.jwt_refresh_expires_in as SignOptions,
//   );

//   return {
//     user,
//     patient,
//     accessToken,
//     refreshToken,
//   };
// };

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
  const otp = payload.otp;
  console.log(otp, "chekOTP");
  const email = payload.email.trim().toLowerCase();

  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExist?.status === "BLOCKED") {
    throw new Error("User is Blocked");
  }

  if (isUserExist?.emailVerified) {
    throw new Error("Email ALready Verified");
  }

  if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
    throw new Error("User is Deleted");
  }

  const otpKey = `patient-registration-otp:${email}`;
  console.log(otpKey, "chek OtpKEY");

  const redisOtp = await redisClient.get(otpKey);
  console.log(redisOtp);

  if (!redisOtp) {
    throw new Error("Invalid OTP");
  }

  if (String(redisOtp) !== String(otp)) {
    throw new Error("OTP Does Not Match");
  }

  await redisClient.del(otpKey);

  const patientRegistrationKey = `patient-registration-data:${email}`;

  const redisPatientData = await redisClient.get(patientRegistrationKey);

  if (!redisPatientData) {
    throw new Error("Patient Doesnt Exist");
  }

  const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

  const createdUser = await prisma.user.create({
    data: {
      name: patientPayload.name,
      email: patientPayload.email,
      password: patientPayload.password,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      patient: {
        create: {
          name: patientPayload.name,
          email: patientPayload.email,
          contactNumber: patientPayload?.patient?.contactNumber || "",
          gender: patientPayload?.patient?.gender,
          dateOfBirth: patientPayload?.patient?.dateOfBirth
            ? new Date(patientPayload.patient.dateOfBirth)
            : undefined,
          bloodGroup: patientPayload?.patient?.bloodGroup,
          medicalHistory: patientPayload?.patient?.medicalHistory,
        },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  await redisClient.del(patientRegistrationKey);

  await sendPatientWelcomeEmail(createdUser.name, email);

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      doctor: {
        select: { verificationStatus: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null) {
    throw new Error(
      "This account has no password yet. Use Google login, or set a password while logged in.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  if (!user.emailVerified) {
    throw new Error("Email is not verified");
  }

  if (
    user.role === Role.DOCTOR &&
    user.doctor?.verificationStatus !== DoctorVerificationStatus.APPROVED
  ) {
    throw new Error(
      "Your doctor application is not approved yet. You cannot log in.",
    );
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
      doctor: true,
      admin: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | null | undefined = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID Token Verification Failed", error);
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload.email) {
    throw new Error("Google Email Not Found");
  }
  if (!googleIdTokenPayload.name) {
    throw new Error("Google Email User Name Not Found");
  }

  const email = googleIdTokenPayload.email.trim().toLowerCase();

  const existingAccount = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAccount && existingAccount.role !== Role.PATIENT) {
    throw new Error("Google login is only available for patients");
  }

  const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = ifPatientExistWithGoogleAuth;

  if (!ifPatientExistWithGoogleAuth) {
    const ifPatientExistWithCredentials = await prisma.user.findUnique({
      where: {
        email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (ifPatientExistWithCredentials) {
      if (!ifPatientExistWithCredentials.emailVerified) {
        throw new Error("Email Not Verified");
      }

      if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
        throw new Error("User Is Blocked");
      }

      if (
        ifPatientExistWithCredentials.isDeleted ||
        ifPatientExistWithCredentials.status === UserStatus.DELETED
      ) {
        throw new Error("User Is Deleted");
      }

      user = await prisma.user.update({
        where: {
          id: ifPatientExistWithCredentials.id,
        },

        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          authProvider: AuthProvider.GOOGLE,
          emailVerified: true,
          patient: {
            create: {
              name: googleIdTokenPayload.name,
              email,
            },
          },
        },
      });

      await sendPatientWelcomeEmail(googleIdTokenPayload.name, email);
    }
  }

  if (!user) {
    throw new Error("User Not Found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User Is Blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User Is Deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const email = payload.email.trim().toLowerCase();
  const isUserExists = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExists) {
    throw new Error("User Does Not Exist!");
  }
  if (isUserExists.status === "BLOCKED") {
    throw new Error("user is BLOCED");
  }

  if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
    throw new Error("user is Deleted");
  }

  if (!isUserExists.password) {
    throw new Error(
      "This account has no password yet. Log in with Google and set a password first.",
    );
  }

  if (!isUserExists.emailVerified) {
    throw new Error("User Not Verified");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forget-password-otp:${isUserExists.email}`;
  const expirationSeconds = 5 * 60;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const tempatePath = path.join(
    process.cwd(),
    "src/app/module/templates/forgot-password.ejs",
  );

  const templateData = {
    name: isUserExists.name,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "Forgot Password",
    // text: `Your OTP is ${otp}`,

    // html : `<h1>Your otb is ${otp} <h1>`
    html,
  });
};

const restPassword = async (payload: IResetPasswordPayload) => {
  const { otp, newPassword } = payload;
  const email = payload.email.trim().toLowerCase();
  const isUserExists = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExists) {
    throw new Error("User Does Not Exist!");
  }
  if (isUserExists.status === "BLOCKED") {
    throw new Error("user is BLOCED");
  }

  if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
    throw new Error("user is Deleted");
  }

  if (!isUserExists.password) {
    throw new Error(
      "This account has no password yet. Log in with Google and set a password first.",
    );
  }

  if (!isUserExists.emailVerified) {
    throw new Error("User Not Verified");
  }
  const key = `forget-password-otp:${isUserExists.email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new Error("Invalid OTP");
  }
  if (String(redisOtp) !== String(otp)) {
    throw new Error("OTP Does Not match");
  }

  const hashNewpassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      email: isUserExists.email,
    },
    data: {
      password: hashNewpassword,
      needPasswordChange: false,
    },
  });

  await redisClient.del([key]);

  const tempatePath = path.join(
    process.cwd(),
    "src/app/module/templates/reset-password-success.ejs",
  );
  const templateData = {
    name: isUserExists.name,
  };
  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "Password changed",
    // text: `Your OTP is ${otp}`,

    // html : `<h1>Your password is changed <h1>`
    html,
  });
};

const sendPatientWelcomeEmail = async (name: string, email: string) => {
  const templatePath = path.join(
    process.cwd(),
    "src/app/module/templates/patient-welcome-email.ejs",
  );
  const html = await ejs.renderFile(templatePath, { name });

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Welcome To PH Healthcare System",
    html,
  });
};

const changePassword = async (
  user: IRequestUser,
  payload: IChangePasswordPayload,
) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: user.userId },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  if (!existingUser.password) {
    throw new Error(
      "This account has no password yet. Use set password instead.",
    );
  }

  const isCurrentPasswordMatched = await bcrypt.compare(
    payload.currentPassword,
    existingUser.password,
  );

  if (!isCurrentPasswordMatched) {
    throw new Error("Current password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds) || 8,
  );

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      password: hashedPassword,
      needPasswordChange: false,
    },
  });
};

const setPassword = async (user: IRequestUser, payload: ISetPasswordPayload) => {
  if (user.role !== Role.PATIENT) {
    throw new Error("Set password is only available for patients");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: user.userId },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  if (existingUser.password) {
    throw new Error(
      "This account already has a password. Use change password instead.",
    );
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds) || 8,
  );

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      password: hashedPassword,
      needPasswordChange: false,
    },
  });
};

export const AuthService = {
  registerPatient,
  verifyPatientEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  restPassword,
  changePassword,
  setPassword,
};
