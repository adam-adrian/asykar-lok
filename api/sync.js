// api/sync.js - Vercel Serverless Function Proxy
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

  // Jika URL belum dipasang di Vercel Environment Variables
  if (!GOOGLE_SCRIPT_URL) {
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'success',
        local: true,
        message: 'GOOGLE_SCRIPT_URL belum diset di Vercel. Berjalan dalam mode lokal.',
        data: { klasemen: [], liga: [], event: [] }
      });
    } else {
      return res.status(200).json({
        status: 'success',
        local: true,
        message: 'Tersimpan lokal (GOOGLE_SCRIPT_URL belum dikonfigurasi di Vercel).'
      });
    }
  }

  try {
    // 1. GET Request: Ambil data publik dari Google Sheets
    if (req.method === 'GET') {
      const response = await fetch(GOOGLE_SCRIPT_URL, { method: 'GET' });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 2. POST Request: Teruskan mutasi (simpan/hapus) ke Google Sheets
    if (req.method === 'POST') {
      // Apps Script tidak dapat membaca header HTTP, jadi token sesi dipindahkan
      // dari header Authorization ke dalam body. Token ditaruh paling akhir agar
      // nilai token yang diselipkan klien di body tidak bisa menimpanya.
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (err) { body = {}; }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};

      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ...body, token })
      });
      const data = await response.json();
      const code = data && data.code;
      const httpStatus = code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : 200;
      return res.status(httpStatus).json(data);
    }

    return res.status(405).json({ status: 'error', message: 'Method tidak diizinkan.' });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ status: 'error', message: 'Gagal menghubungi Google Apps Script: ' + err.message });
  }
}
