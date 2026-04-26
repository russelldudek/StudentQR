import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'prom-checkin-api' });
});

export default healthRouter;
