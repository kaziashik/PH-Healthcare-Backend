import { UserStatus } from "../../../generated/prisma/enums";

export interface ICreateManagedAccountPayload {
  name: string;
  organizationEmail: string;
  personalEmail: string;
  contactNumber?: string;
  address?: string;
}

export interface IUpdateAccountStatusPayload {
  userId: string;
  status: UserStatus;
}
