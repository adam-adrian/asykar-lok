// server.js - Dev Server untuk Offline Demo & Vercel API Simulation
// Menjalankan static file server sekaligus mock /api/login & /api/sync tanpa dependency npm.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

// Paksa urutan resolusi IPv4 terlebih dahulu untuk mencegah ENETUNREACH saat host tidak memiliki rute IPv6
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.argv[2] || 8899);

// Muat variabel lingkungan dari .env.local atau .env jika ada
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > -1) {
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[k]) process.env[k] = v;
          }
        }
      });
      break;
    }
  }
}
loadEnv();

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

// Mock Database Lokal (Offline Demo: 1 user admin & 1 entry sakan)
const DB_FILE = path.join(__dirname, '.local-db.json');

function initDb() {
  const defaultDb = {
    users: [
      { username: 'admin', password: 'admin123', role: 'admin_utama', label: 'Admin Utama', status: 'active' },
      { username: 'admin', password: 'admin', role: 'admin_utama', label: 'Admin Utama', status: 'active' }
    ],
    gedung: [
      { id: 'qazvin', nama: 'QAZVIN', urutan: 1, aktif: true }
    ],
    sakan: [
      { id: 'qazvin-atas', nama: 'QAZVIN ATAS', gedung: 'QAZVIN', urutan: 1, aktif: true }
    ],
    klasemen: [],
    liga: [],
    event: []
  };

  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return { ...defaultDb, ...parsed };
    } catch (e) {
      console.warn('Gagal membaca .local-db.json, menggunakan default db.');
    }
  }
  return defaultDb;
}

const db = initDb();

function persistDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.warn('Gagal menulis .local-db.json:', e.message);
  }
}

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // =========================================================================
  // 1. API: /api/login
  // =========================================================================
  if (pathname === '/api/login') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { status: 'error', message: 'Method tidak diizinkan.' });
    }

    const body = await parseJsonBody(req);
    const { username, password } = body;

    // Jika ada GOOGLE_SCRIPT_URL asli, coba proxy ke Apps Script terlebih dahulu
    if (GOOGLE_SCRIPT_URL) {
      try {
        const proxyRes = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'login', payload: { username, password } }),
          redirect: 'follow'
        });
        const text = await proxyRes.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          if (data.status === 'success') {
            // Cache user sukses ke db.users lokal agar offline fallback tetap punya kredensial ini
            if (data.user && data.user.username) {
              const uIdx = db.users.findIndex(u => String(u.username).toLowerCase() === String(data.user.username).toLowerCase());
              const userEntry = {
                username: data.user.username,
                password,
                role: data.user.role || 'admin_sakan',
                label: data.user.label || data.user.username,
                status: 'active'
              };
              if (uIdx > -1) {
                db.users[uIdx] = { ...db.users[uIdx], ...userEntry };
              } else {
                db.users.push(userEntry);
              }
              persistDb();
            }
            return sendJson(res, 200, data);
          } else {
            // Apps Script explicitly rejected credentials
            return sendJson(res, 401, data);
          }
        }
      } catch (err) {
        console.warn('Apps Script login gagal, mencoba database lokal:', err.message, err.cause ? err.cause.message || err.cause : '');
      }
    }

    // Mode Offline Demo / Fallback: Verifikasi ke mock db
    const matched = db.users.find(u =>
      String(u.username).trim().toLowerCase() === String(username || '').trim().toLowerCase() &&
      String(u.password).trim() === String(password || '').trim()
    );

    if (matched) {
      return sendJson(res, 200, {
        status: 'success',
        local: true,
        user: {
          username: matched.username,
          role: matched.role || 'admin_utama',
          label: matched.label || 'Admin Utama'
        },
        token: 'demo_token_' + Date.now()
      });
    }

    return sendJson(res, 401, {
      status: 'error',
      message: 'Username atau password salah (Demo: admin / admin123).'
    });
  }

  // =========================================================================
  // 2. API: /api/sync
  // =========================================================================
  if (pathname === '/api/sync') {
    // Jika ada GOOGLE_SCRIPT_URL asli, coba proxy ke Apps Script
    if (GOOGLE_SCRIPT_URL) {
      try {
        if (req.method === 'GET') {
          const proxyRes = await fetch(GOOGLE_SCRIPT_URL, { method: 'GET', redirect: 'follow' });
          const text = await proxyRes.text();
          if (text.startsWith('{')) {
            const data = JSON.parse(text);
            return sendJson(res, 200, data);
          }
        }
        if (req.method === 'POST') {
          const auth = req.headers.authorization || '';
          const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
          const body = await parseJsonBody(req);
          const isDemoToken = token.startsWith('demo_token_');

          if (!isDemoToken) {
            const proxyRes = await fetch(GOOGLE_SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ ...body, token }),
              redirect: 'follow'
            });
            const text = await proxyRes.text();
            if (text.startsWith('{')) {
              const data = JSON.parse(text);
              const code = data && data.code;
              const httpStatus = code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : 200;
              return sendJson(res, httpStatus, data);
            }
            console.warn('Apps Script POST non-JSON, fallback ke lokal.');
          } else {
            console.log('Menggunakan demo token lokal, mutasi disimpan ke database lokal.');
          }
          // Teruskan body ke handler lokal di bawah
          req._parsedBody = body;
        }
      } catch (err) {
        console.warn('Gagal sync ke Google Apps Script, fallback ke lokal:', err.message);
      }
    }

    // Mode Offline Demo: Handle GET & POST lokal
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'success',
        local: true,
        message: 'Berjalan dalam mode offline demo lokal.',
        data: {
          klasemen: db.klasemen,
          liga: db.liga,
          event: db.event,
          gedung: db.gedung,
          sakan: db.sakan
        }
      });
    }

    if (req.method === 'POST') {
      const body = req._parsedBody || await parseJsonBody(req);
      const action = body.action;
      const payload = body.payload || {};

      if (action === 'save_klasemen') {
        const t = payload.tanggal;
        const s = payload.sakan;
        let existing = db.klasemen.find(i => i.tanggal === t && String(i.sakan).toUpperCase() === String(s).toUpperCase());
        const totalPoin = (Number(payload.kebersihan) || 0) + (Number(payload.kedisiplinan) || 0) + (Number(payload.bahasa) || 0);

        if (existing) {
          if ('kebersihan' in payload) existing.kebersihan = payload.kebersihan;
          if ('kedisiplinan' in payload) existing.kedisiplinan = payload.kedisiplinan;
          if ('bahasa' in payload) existing.bahasa = payload.bahasa;
          existing.totalPoin = totalPoin;
        } else {
          db.klasemen.push({
            id: Date.now().toString(),
            tanggal: t,
            sakan: s,
            kebersihan: payload.kebersihan != null ? payload.kebersihan : null,
            kedisiplinan: payload.kedisiplinan != null ? payload.kedisiplinan : null,
            bahasa: payload.bahasa != null ? payload.bahasa : null,
            totalPoin: totalPoin
          });
        }
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true });
      }

      if (action === 'save_klasemen_bulk') {
        const entries = Array.isArray(payload) ? payload : (Array.isArray(payload.entries) ? payload.entries : []);
        entries.forEach(item => {
          const t = item.tanggal;
          const s = item.sakan;
          let existing = db.klasemen.find(i => i.tanggal === t && String(i.sakan).toUpperCase() === String(s).toUpperCase());
          const totalPoin = (Number(item.kebersihan) || 0) + (Number(item.kedisiplinan) || 0) + (Number(item.bahasa) || 0);

          if (existing) {
            if ('kebersihan' in item) existing.kebersihan = item.kebersihan;
            if ('kedisiplinan' in item) existing.kedisiplinan = item.kedisiplinan;
            if ('bahasa' in item) existing.bahasa = item.bahasa;
            existing.totalPoin = totalPoin;
          } else {
            db.klasemen.push({
              id: Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              tanggal: t,
              sakan: s,
              kebersihan: item.kebersihan != null ? item.kebersihan : null,
              kedisiplinan: item.kedisiplinan != null ? item.kedisiplinan : null,
              bahasa: item.bahasa != null ? item.bahasa : null,
              totalPoin: totalPoin
            });
          }
        });
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true, updated: entries.length });
      }

      if (action === 'delete_klasemen') {
        db.klasemen = db.klasemen.filter(i => !(i.tanggal === payload.tanggal && String(i.sakan).toUpperCase() === String(payload.sakan).toUpperCase()));
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true });
      }

      if (action === 'save_match') {
        const id = payload.id || Date.now().toString();
        const existingIdx = db.liga.findIndex(i => String(i.id) === String(id));
        const matchData = {
          id: id,
          round: payload.round,
          tanggal: payload.tanggal,
          waktu: payload.waktu || '',
          lokasi: payload.lokasi || '',
          timA: payload.timA,
          timB: payload.timB,
          skorA: payload.skorA,
          skorB: payload.skorB,
          status: payload.status || 'UPCOMING'
        };
        if (existingIdx >= 0) {
          db.liga[existingIdx] = matchData;
        } else {
          db.liga.push(matchData);
        }
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true });
      }

      if (action === 'delete_match') {
        db.liga = db.liga.filter(i => String(i.id) !== String(payload.id));
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true });
      }

      if (action === 'save_event') {
        const id = payload.id || Date.now().toString();
        const existingIdx = db.event.findIndex(i => String(i.id) === String(id));
        let foto = '';
        if (payload.fotoBase64) {
          foto = payload.fotoBase64;
        } else if (payload.foto !== undefined && payload.foto !== null) {
          foto = payload.foto;
        } else if (existingIdx >= 0) {
          foto = db.event[existingIdx].foto || '';
        }

        const eventData = {
          id: id,
          kategori: payload.kategori || 'Event Umum',
          tanggal: payload.tanggal || '',
          waktu: payload.waktu || '',
          judul: payload.judul || '',
          lokasi: payload.lokasi || '',
          deskripsi: payload.deskripsi || '',
          foto: foto
        };
        if (existingIdx >= 0) {
          db.event[existingIdx] = eventData;
        } else {
          db.event.push(eventData);
        }
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true, foto: foto });
      }

      if (action === 'delete_event') {
        db.event = db.event.filter(i => String(i.id) !== String(payload.id));
        persistDb();
        return sendJson(res, 200, { status: 'success', local: true });
      }

      return sendJson(res, 400, { status: 'error', message: 'Aksi tidak dikenal: ' + action });
    }

    return sendJson(res, 405, { status: 'error', message: 'Method tidak diizinkan.' });
  }

  // =========================================================================
  // 3. STATIC FILE SERVER
  // =========================================================================
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n==================================================`);
  console.log(`🚀 League of Kindness Dev Server running!`);
  console.log(`👉 http://127.0.0.1:${PORT}/index.html`);
  console.log(`Mode: ${GOOGLE_SCRIPT_URL ? 'Proxy Google Apps Script' : 'Offline Demo Fungsional'}`);
  if (!GOOGLE_SCRIPT_URL) {
    console.log(`🔑 Demo Login: admin / admin123 (atau admin / admin)`);
    console.log(`🏠 Sakan Demo: 1 entry (QAZVIN ATAS)`);
  }
  console.log(`==================================================\n`);
});
