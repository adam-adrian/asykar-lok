// api/login.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Aktifkan CORS untuk fleksibilitas
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method tidak diizinkan.' });
  }

  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi.' });
    }

    // Jika GOOGLE_SCRIPT_URL belum diset di Vercel Environment Variables
    if (!GOOGLE_SCRIPT_URL) {
      return res.status(503).json({
        status: 'error',
        message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi di Environment Variables Vercel.'
      });
    }

    // Teruskan verifikasi ke Google Apps Script (Tab 'Users')
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'login',
        payload: { username, password }
      })
    });

    const data = await response.json();
    return res.status(response.ok && data.status === 'success' ? 200 : 401).json(data);

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ status: 'error', message: 'Gagal memproses login: ' + err.message });
  }
}
