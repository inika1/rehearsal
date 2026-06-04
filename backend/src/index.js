import cors from 'cors';
import express from 'express';
import conversations from './routes/conversations.js';
import people from './routes/people.js';
import speech from './routes/speech.js';

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
app.use('/api/speech', speech);

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`[rehearsal-backend] listening on :${port}`);
});
