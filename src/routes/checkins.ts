import { Router } from 'express';
import { randomUUID } from 'crypto';
import { CheckIn, CreateCheckInRequest } from '../models/types';

const checkInRouter = Router();
const checkIns: CheckIn[] = [];

checkInRouter.get('/', (_req, res) => {
  res.status(200).json(checkIns);
});

checkInRouter.post('/', (req, res) => {
  const body = req.body as Partial<CreateCheckInRequest>;

  if (!body.studentId || !body.eventId || !body.checkedInBy) {
    return res.status(400).json({
      error: 'studentId, eventId, and checkedInBy are required'
    });
  }

  const alreadyCheckedIn = checkIns.find(
    (entry) => entry.studentId === body.studentId && entry.eventId === body.eventId
  );

  if (alreadyCheckedIn) {
    return res.status(409).json({
      error: 'Student is already checked in for this event',
      checkIn: alreadyCheckedIn
    });
  }

  const checkIn: CheckIn = {
    id: randomUUID(),
    studentId: body.studentId,
    eventId: body.eventId,
    checkedInBy: body.checkedInBy,
    checkedInAt: new Date().toISOString()
  };

  checkIns.push(checkIn);
  return res.status(201).json(checkIn);
});

export default checkInRouter;
