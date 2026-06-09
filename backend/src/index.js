import cors from 'cors';
import express from 'express';
import auth from './routes/auth.js';
import conversations from './routes/conversations.js';
import people from './routes/people.js';
import speech from './routes/speech.js';

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || true,
  })
);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', auth);
app.use('/api/people', people);
app.use('/api/conversations', conversations);
app.use('/api/speech', speech);

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`[bridge-backend] listening on :${port}`);
});
