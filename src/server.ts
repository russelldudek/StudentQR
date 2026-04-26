import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import checkInRouter from './routes/checkins';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/checkins', checkInRouter);

app.listen(port, () => {
  console.log(`Prom check-in API running on port ${port}`);
});
