export interface CheckIn {
  id: string;
  studentId: string;
  eventId: string;
  checkedInAt: string;
  checkedInBy: string;
}

export interface CreateCheckInRequest {
  studentId: string;
  eventId: string;
  checkedInBy: string;
}
