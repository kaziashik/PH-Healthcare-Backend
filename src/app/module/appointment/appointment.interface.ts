
export interface IBookAppointmentPayload {
    scheduleId: string;
    serialNumber: number;
}
export interface IPayAppointmentPayload {
    appointmentId: string;
}
export interface ICancelAppointmentPayload {
    appointmentId: string;
}

export interface IUpdateAppointmentStatusPayload {
    status: "ONGOING" | "COMPLETED";
    // status: AppointmentStatus
}
