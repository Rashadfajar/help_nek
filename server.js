// server.js – versi fix untuk Railway
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// log sederhana utk cek admin key
app.use((req, _res, next) => {
  const k = (req.header('x-admin-key') || '').trim();
  console.log(`${req.method} ${req.url}  hasKey=${!!k}  keyMatch=${k === String(process.env.ADMIN_KEY||'').trim()}`);
  next();
});

// static files
app.use(express.static(path.join(__dirname, 'public')));

// --- ENV mapping (baca dari DB_* atau MYSQL* milik Railway) ---
const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST;
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER;
const DB_PASS = process.env.DB_PASS || process.env.MYSQLPASSWORD;
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE;
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306);
const DB_SSL  = String(process.env.DB_SSL || '').toLowerCase() === 'true';


// middleware admin
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme-admin-key';
function checkAdmin(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// root (optional)
const INDEX_HTML = path.join(__dirname, 'public', 'index.html');
if (fs.existsSync(INDEX_HTML)) {
  app.get('/', (_req, res) => res.sendFile(INDEX_HTML));
}

// ====== HEALTH ======
app.get('/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ====== PUBLIC READ ======
app.get('/faq', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, question AS title, answer AS content, image_url FROM faq ORDER BY id ASC'
    );
  res.json(rows);
  } catch (e) {
    console.error('FAQ error:', e);
    res.status(500).json({ error: 'Gagal mengambil data FAQ' });
  }
});

app.get('/glossary', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, term AS title, definition AS content FROM glossary ORDER BY id ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error('Glossary error:', e);
    res.status(500).json({ error: 'Gagal mengambil data glosarium' });
  }
});

// ====== ADMIN CRUD: FAQ ======
// POST /faq
app.post('/faq', checkAdmin, async (req, res) => {
  try {
    const { title, content, image_url } = req.body || {}; // <- tambahkan image_url
    if (!title || !content) return res.status(400).json({ error: 'title & content wajib' });

    const [r] = await pool.execute(
      'INSERT INTO faq (question, answer, image_url) VALUES (?,?,?)',
      [title, content, image_url || null]
    );
    res.status(201).json({ id: r.insertId, title, content, image_url: image_url || null });
  } catch (e) {
    console.error('FAQ POST error:', e);
    res.status(500).json({ error: 'Gagal menambah FAQ' });
  }
});

// PUT /faq/:id
app.put('/faq/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, image_url } = req.body || {}; // <- tambahkan image_url
    if (!title || !content) return res.status(400).json({ error: 'title & content wajib' });

    const [r] = await pool.execute(
      'UPDATE faq SET question=?, answer=?, image_url=? WHERE id=?',
      [title, content, image_url || null, id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'FAQ tidak ditemukan' });
    res.json({ id: Number(id), title, content, image_url: image_url || null });
  } catch (e) {
    console.error('FAQ PUT error:', e);
    res.status(500).json({ error: 'Gagal memperbarui FAQ' });
  }
});


app.delete('/faq/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await pool.execute('DELETE FROM faq WHERE id=?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'FAQ tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    console.error('FAQ DELETE error:', e);
    res.status(500).json({ error: 'Gagal menghapus FAQ' });
  }
});

// ====== ADMIN CRUD: GLOSSARY ======
app.post('/glossary', checkAdmin, async (req, res) => {
  try {
    const { title, content } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'title & content wajib' });
    const [r] = await pool.execute('INSERT INTO glossary (term, definition) VALUES (?,?)', [title, content]);
    res.status(201).json({ id: r.insertId, title, content });
  } catch (e) {
    console.error('Glossary POST error:', e);
    res.status(500).json({ error: 'Gagal menambah glosarium' });
  }
});

app.put('/glossary/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'title & content wajib' });
    const [r] = await pool.execute('UPDATE glossary SET term=?, definition=? WHERE id=?', [title, content, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Istilah tidak ditemukan' });
    res.json({ id: Number(id), title, content });
  } catch (e) {
    console.error('Glossary PUT error:', e);
    res.status(500).json({ error: 'Gagal memperbarui glosarium' });
  }
});

app.delete('/glossary/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await pool.execute('DELETE FROM glossary WHERE id=?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Istilah tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Glossary DELETE error:', e);
    res.status(500).json({ error: 'Gagal menghapus glosarium' });
  }
});

// --- START SERVER (satu kali saja) ---
app.listen(PORT, () => {
  console.log(`Server berjalan di :${PORT}`);
  console.log(`Admin key (header x-admin-key): ${ADMIN_KEY ? '[set]' : '[default]'}`);
});
