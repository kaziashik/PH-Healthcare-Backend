import { NextFunction, Request, Response } from 'express';
import httpStatus from "http-status";
import { Prisma } from '../../generated/prisma/client';
import config from '../config';
import { AppError } from '../utils/AppError';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const globalErrorHandler = async (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    if (config.node_env === 'development') {
        console.log('Error from Global Error Handler', err)
    }

    let statusCode : number = httpStatus.INTERNAL_SERVER_ERROR;
    let errorMessage = err.message || "Internal Server Error";
    let errorName = err.name || "Internal Server Error";
    // let errorDetails = err.stack

    if (err instanceof Prisma.PrismaClientValidationError) {
        statusCode = httpStatus.BAD_REQUEST;
        errorMessage = "You have provided incorrect field type or missing fields"
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
            statusCode = httpStatus.BAD_REQUEST,
                errorMessage = "Duplicate Key Error"
        } else if (err.code === "P2003") {
            statusCode = httpStatus.BAD_REQUEST,
                errorMessage = "Foreign key constraint failed"
        } else if (err.code === "P2025") {
            statusCode = httpStatus.BAD_REQUEST,
                errorMessage = "An operation failed because it depends on one or more records that were required but not found."
        }
    } else if (err instanceof Prisma.PrismaClientInitializationError) {
        if (err.errorCode === "P1000") {
            statusCode = httpStatus.UNAUTHORIZED;
            errorMessage = "Authentication failed against database server. Please Check Your Credentials"
        } else if (err.errorCode === "P1001") {
            statusCode = httpStatus.BAD_REQUEST;
            errorMessage = "Can't reach database server"
        }
    } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        errorMessage = "Error occurred during query execution"
    }
    else if( err instanceof AppError){
		errorMessage = err.message
		statusCode = err.statusCode
    }
    
    else if (err instanceof Error) {
        errorMessage = err.message
        statusCode = clientErrorStatus(err.message)
    }





    const isClientError = statusCode >= 400 && statusCode < 500;

    res.status(statusCode).json({
        success: false,
        statusCode: statusCode || httpStatus.INTERNAL_SERVER_ERROR,
        name: config.node_env === 'development' ? errorName : isClientError ? errorName : "Internal Server Error",
        message: config.node_env === 'development' || isClientError ? errorMessage : "Internal Server Error",
        error: config.node_env === 'development' ? err : undefined,
        stack: config.node_env  === 'development' ? err.stack : undefined,
    })
}

const clientErrorStatus = (message: string) => {
    const text = message.toLowerCase();

    if (
        text.includes("not logged in") ||
        text.includes("invalid credentials") ||
        text.includes("current password is incorrect") ||
        text.includes("refresh token") ||
        text.includes("invalid or expired") ||
        text.includes("invalid token") ||
        text.includes("jwt")
    ) {
        return httpStatus.UNAUTHORIZED;
    }

    if (
        text.includes("forbidden") ||
        text.includes("don't have permission") ||
        text.includes("do not have permission") ||
        text.includes("not allowed") ||
        text.includes("blocked") ||
        text.includes("not approved") ||
        text.includes("not verified") ||
        text.includes("must change your password") ||
        text.includes("only available for patients") ||
        text.includes("only a super admin")
    ) {
        return httpStatus.FORBIDDEN;
    }

    if (
        text.includes("not found") ||
        text.includes("does not exist") ||
        text.includes("doesnt exist")
    ) {
        return httpStatus.NOT_FOUND;
    }

    if (text.includes("already")) {
        return httpStatus.CONFLICT;
    }

    if (
        text.includes("invalid") ||
        text.includes("expected") ||
        text.includes("too small") ||
        text.includes("too big") ||
        text.includes("required") ||
        text.includes("must ") ||
        text.includes("otp") ||
        text.includes("no password") ||
        text.includes("no file")
    ) {
        return httpStatus.BAD_REQUEST;
    }

    return httpStatus.INTERNAL_SERVER_ERROR;
}
