import PDFDocument from "pdfkit";

export type AppointmentInvoice = {
    patientName: string;
    patientEmail: string;
    doctorName: string;
    specialization: string;
    appointmentDate: string;
    joiningTime: string;
    serialNumber: string;
    meetingLink: string;
    amount: string;
    transactionId: string;
    paidAt: string;
};

export const buildAppointmentInvoicePdf = (invoice: AppointmentInvoice) =>
    new Promise<Buffer>((resolve, reject) => {
        const pdfDocument = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        pdfDocument.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        pdfDocument.on("error", reject);
        pdfDocument.on("end", () => {
            resolve(Buffer.concat(chunks));
        });

        pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
        pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
        pdfDocument.moveDown(2);

        pdfDocument.fontSize(12).text(`Patient Name: ${invoice.patientName}`);
        pdfDocument.text(`Patient Email: ${invoice.patientEmail}`);
        pdfDocument.moveDown();

        pdfDocument.text(`Doctor Name: ${invoice.doctorName}`);
        pdfDocument.text(`Specialization: ${invoice.specialization}`);
        pdfDocument.moveDown();

        pdfDocument.text(`Appointment Date: ${invoice.appointmentDate}`);
        pdfDocument.text(`Your Joining Time: ${invoice.joiningTime}`);
        pdfDocument.text(`Your Serial Number: ${invoice.serialNumber}`);
        pdfDocument.text(`Meeting Link: ${invoice.meetingLink}`);
        pdfDocument.moveDown();

        pdfDocument.text(`Amount Paid: ${invoice.amount} BDT`);
        pdfDocument.text("Payment Method: bKash");
        pdfDocument.text(`Transaction Id: ${invoice.transactionId}`);
        pdfDocument.text(`Paid At: ${invoice.paidAt}`);

        pdfDocument.end();
    });
