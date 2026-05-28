import express from 'express';
import cors from 'cors';
import people from './routes/people.js';
import conversations from './routes/conversations.js';

const app = express();
app.use(express.json());

// Allow the frontend origin (set FRONTEND_ORIGIN in prod; default permissive for dev).
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || true,
  })
);

// Health check — useful for Railway and for the CD smoke test.
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/people', people);
app.use('/api/conversations', conversations);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[rehearsal-backend] listening on :${port}`);
});
