import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentServices } from "./payment.service";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data, meta } = await PaymentServices.getMyPayments(req.query, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getPaymentSummary = catchAsync(async (req: Request, res: Response) => {
    const result = await PaymentServices.getPaymentSummary();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment Summary Retrieved Successfully",
        data: result,
    });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const { data, meta } = await PaymentServices.getAllPayments(req.query);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getMyReceipt = catchAsync(async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    const user = req.user!;
    const pdf = await PaymentServices.getMyReceipt(paymentId, user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        'inline; filename="invoice.pdf"',
    );
    res.status(httpStatus.OK).end(pdf);
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    const user = req.user!;

    const result = await PaymentServices.getSinglePayment(paymentId, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment Retrieved Successfully",
        data: result,
    });
});

export const PaymentController = {
    getMyPayments,
    getMyReceipt,
    getPaymentSummary,
    getAllPayments,
    getSinglePayment,
};
