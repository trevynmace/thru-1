// NORTHBOUND — Node/Express host.
//
// Serves the client from public/ and mounts the shared data modules at /data so the
// exact same ES modules are imported by the browser and by `node --test`. Also provides
// the file-backed save + high-score API (mirrors the original MonoGame FileIO/IOController
// and the /web port's save endpoints).
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3100;

const SAVE_DIR = join(__dirname, 'saves');
const SAVE_FILE = join(SAVE_DIR, 'save.json');
const SCORE_FILE = join(SAVE_DIR, 'scores.json');

app.use(express.json({ limit: '2mb' }));

// Long-lived caching would fight iteration; keep it simple and always fresh.
app.use(express.static(join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.use('/data', express.static(join(__dirname, 'data'), { etag: true, maxAge: 0 }));

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(SAVE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

// --- Save game ---
app.post('/api/save', async (req, res) => {
  try { await writeJson(SAVE_FILE, req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// "There is no save yet" is the normal first-run state, not an error. A 404 here makes
// the browser log a failed resource load on every cold start, so answer 204 instead.
async function sendSave(req, res) {
  const data = await readJson(SAVE_FILE, null);
  if (!data) return res.status(204).end();
  res.json(data);
}
app.get('/api/load', sendSave);
app.get('/api/save', sendSave);   // alias: the client probes both spellings

app.delete('/api/save', async (req, res) => {
  try { await fs.unlink(SAVE_FILE); } catch {}
  res.json({ ok: true });
});

// --- Hall of fame ---
app.get('/api/scores', async (req, res) => {
  const scores = await readJson(SCORE_FILE, []);
  res.json(scores.slice(0, 10));
});

app.post('/api/scores', async (req, res) => {
  try {
    const scores = await readJson(SCORE_FILE, []);
    const entry = req.body || {};
    scores.push({
      name: String(entry.name || 'Anonymous').slice(0, 24),
      score: Number(entry.score) || 0,
      rank: String(entry.rank || '').slice(0, 32),
      miles: Number(entry.miles) || 0,
      date: String(entry.date || '').slice(0, 32),
    });
    scores.sort((a, b) => b.score - a.score);
    await writeJson(SCORE_FILE, scores.slice(0, 10));
    res.json({ ok: true, scores: scores.slice(0, 10) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.listen(PORT, () => {
  console.log(`\n  NORTHBOUND is running at http://localhost:${PORT}\n`);
});
