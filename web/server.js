// Thru — Node/Express server. Serves the game and provides a file-backed save
// system (mirrors the original MonoGame FileIO/IOController: read/write JSON to disk).
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SAVE_DIR = join(__dirname, 'saves');
const SAVE_FILE = join(SAVE_DIR, 'save.json');

app.use(express.json({ limit: '1mb' }));

// Static game client + shared data modules (the client imports /data/*.js).
app.use(express.static(join(__dirname, 'public')));
app.use('/data', express.static(join(__dirname, 'data')));

// --- Save API ---
app.post('/api/save', async (req, res) => {
  try {
    await fs.mkdir(SAVE_DIR, { recursive: true });
    await fs.writeFile(SAVE_FILE, JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get('/api/load', async (req, res) => {
  try {
    const data = await fs.readFile(SAVE_FILE, 'utf8');
    res.type('application/json').send(data);
  } catch { res.status(404).json({ ok: false }); }
});

app.delete('/api/save', async (req, res) => {
  try { await fs.unlink(SAVE_FILE); } catch {}
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  🥾 Thru is running at http://localhost:${PORT}\n`);
});
