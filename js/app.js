/**
 * =========================================================================
 * LEAGUE OF KINDNESS (LK) - APPLICATION SCRIPT
 * =========================================================================
 * 
 * Daftar Isi:
 * 1. KONFIGURASI ENDPOINT & DAFTAR SAKAN
 * 2. STATE APLIKASI & LOCAL STORAGE KEYS
 * 3. HELPER PENYIMPANAN LOKAL (LOCALSTORAGE & SESSIONSTORAGE)
 * 4. HELPER UTILITAS (TANGGAL, WAKTU, STRING ESCAPING, MODAL, TOAST)
 * 5. CLOUD SYNC & API CALLS (VERCEL SERVERLESS PROXY -> GOOGLE APPS SCRIPT)
 * 6. AUTENTIKASI & KONTROL AKSES ROLE-BASED
 * 7. NAVIGASI & ROUTING (VIEW SWITCHER & BROWSER HISTORY)
 * 8. MODUL 1: KLASEMEN KEBAIKAN (HARIAN & REKAP RATA-RATA)
 * 9. MODUL 2: TURNAMEN BOLA (BAGAN SISTEM AKAR / BRACKET & SKOR)
 * 10. MODUL 3: AGENDA & EVENT (DOKUMENTASI DENGAN KOMPRESI GAMBAR)
 * 11. INISIALISASI APLIKASI (EVENT LISTENERS & STARTUP)
 * =========================================================================
 */

/* =========================================================================
   KONFIGURASI ENDPOINT VERCEL PROXY (AMAN, TANPA HARDCODED SECRET)
   ========================================================================= */
const API_URL = "/api/sync";
const AUTH_URL = "/api/login";

// Instansiasi DataStore tunggal (Tingkat 1)
const store = new DataStoreModule.DataStore(new DataStoreModule.HttpTransportAdapter(API_URL));
window.store = store;

// Observer reaktif terkalibrasi untuk status sinkronisasi pasif
store.subscribe(snap => {
  updateSyncStatus(snap.sync.status, snap.sync.label);
  // Re-render pasif baris data untuk memperbarui badge WhatsApp (🕒 -> ✓)
  if (currentView === "klasemen") renderKlasemen();
  else if (currentView === "liga") renderligaMenu();
  else if (currentView === "event") renderEvent();
  else if (currentView === "homepage") renderDashboard();
});

let currentUser="", currentRole="", currentLabel="", currentAuthToken="";
let currentView="homepage";
let editingKlasemenKey=null;
let tempBase64Image = "";

// State proxy bridges untuk menjamin kompatibilitas fungsi legacy
Object.defineProperty(window, 'dataKlasemen', {
  get: () => store.getKlasemen(),
  set: (val) => { store.state.klasemen = val; }
});
Object.defineProperty(window, 'dataLiga', {
  get: () => store.getMatches(),
  set: (val) => { store.state.liga = val; }
});
Object.defineProperty(window, 'dataEvent', {
  get: () => store.getEvents(),
  set: (val) => { store.state.event = val; }
});
Object.defineProperty(window, 'dataGedung', {
  get: () => store.getGedung(),
  set: (val) => { store.state.gedung = val; }
});
Object.defineProperty(window, 'dataSakan', {
  get: () => store.getSakan(),
  set: (val) => { store.state.sakan = val; }
});

const KEY_DATA="lok-klasemen-v5", KEY_LIGA="lok-liga-v5", KEY_EVENT="lok-event-v5", KEY_SESSION="lok-session-v5";

/* ===== LOCAL STORAGE HELPERS ===== */
function loadData(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Gagal membaca localStorage:', e);
    return [];
  }
}
function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Gagal menulis localStorage:', e);
  }
}
function loadSession() {
  try {
    const s = sessionStorage.getItem(KEY_SESSION);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function saveSession() {
  try {
    sessionStorage.setItem(KEY_SESSION, JSON.stringify({
      user: currentUser,
      role: currentRole,
      label: currentLabel,
      token: currentAuthToken,
      view: currentView
    }));
  } catch (e) {}
}
function clearSession() {
  try {
    sessionStorage.removeItem(KEY_SESSION);
  } catch (e) {}
}

function todayStr(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function normalizeDateStr(val){
  if(!val) return "";
  let s = String(val).trim();
  if(s.includes("T")) s = s.split("T")[0];
  s = s.replace(/[\/\.]/g, "-");
  
  // Tangani format DD-MM-YYYY -> YYYY-MM-DD
  const ddmmyyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if(ddmmyyyy){
    s = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,"0")}-${ddmmyyyy[1].padStart(2,"0")}`;
  }
  
  // Validasi ISO YYYY-MM-DD
  const isIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!isIso) return "";
  
  const y = parseInt(isIso[1], 10);
  const m = parseInt(isIso[2], 10);
  const d = parseInt(isIso[3], 10);
  
  if(y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  
  // Validasi kalender asli (kabisat, jumlah hari per bulan)
  const chk = new Date(y, m - 1, d);
  if(chk.getFullYear() !== y || chk.getMonth() !== (m - 1) || chk.getDate() !== d) return "";
  
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function formatWaktu(w){
  if(!w) return "Sepanjang Hari";
  const str = String(w).trim();
  if(str === "1899-12-30" || str === "1899-12-31") return "–";
  if(str.includes("T")){
    const parts = str.split("T")[1];
    if(parts) return parts.substring(0, 5) + " WIB";
  }
  if(/^\d{1,2}:\d{2}/.test(str)){
    return str.substring(0, 5) + " WIB";
  }
  return str;
}

function formatTanggal(t, includeDay = true){
  if(!t) return "–";
  let str = String(t).trim();
  if(str.includes("T")) str = str.split("T")[0];
  const parts = str.split("-");
  if(parts.length === 3){
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if(!isNaN(dateObj.getTime())){
      return dateObj.toLocaleDateString("id-ID", {
        weekday: includeDay ? "long" : undefined,
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    }
  }
  return str;
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}
function sanitizeImageUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  if (/^(https?:\/\/|data:image\/|\/)/i.test(str)) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  return '';
}
function formatTitleCase(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(?:^|\s|-|\/)\S/g, c => c.toUpperCase());
}
function formatShortDate(t, includeDay = false) {
  if (!t) return "";
  let str = String(t).trim();
  if (str.includes("T")) str = str.split("T")[0];
  const parts = str.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    const monthStr = months[m] || "";
    if (includeDay) {
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) {
        const dayName = dateObj.toLocaleDateString("id-ID", { weekday: "long" });
        return `${dayName}, ${d} ${monthStr}`.trim();
      }
    }
    return `${d} ${monthStr}`.trim();
  }
  return t;
}
function getTeamInitial(name) {
  if (!name) return '•';
  const clean = String(name).replace(/^sakan\s+/i, '').trim();
  return (clean[0] || name[0] || '•').toUpperCase();
}
function showToast(msg, typeOrIsError, duration) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Normalisasi tipe: boolean (dukungan legacy isError) atau string ('success', 'err'/'error', 'info')
  let type = 'success';
  if (typeof typeOrIsError === 'boolean') {
    type = typeOrIsError ? 'err' : 'success';
  } else if (typeof typeOrIsError === 'string') {
    type = typeOrIsError === 'error' ? 'err' : typeOrIsError;
  }

  // Semantic Guard: jangan biarkan pesan in-progress/loading menggunakan visual success
  const lowerMsg = String(msg || '').toLowerCase();
  if (type === 'success') {
    if (/^(mengambil|mencoba|memuat)/.test(lowerMsg) || lowerMsg.includes('sedang berlangsung')) {
      type = 'info';
    }
  }

  // Icon SVG statis (bebas animasi spinner agar user paham data sudah terekam optimis dan tidak perlu menunggu)
  let iconHtml = '';
  if (type === 'err') {
    iconHtml = '<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else if (type === 'info') {
    iconHtml = '<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  } else {
    iconHtml = '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  }

  const closeIconHtml = '<svg class="svg-icon sm" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  toast.innerHTML = `
    <span class="toast-icon">${iconHtml}</span>
    <span class="toast-msg">${escapeHtml(msg)}</span>
    <span class="toast-close" title="Tutup">${closeIconHtml}</span>
  `;

  toast.className = `show ${type}`;

  // Smart duration: Error = 4500ms, Success/Info = 2800ms
  const autoDuration = duration || (type === 'err' ? 4500 : 2800);

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, autoDuration);
}

function dismissToast() {
  const toast = document.getElementById('toast');
  if (toast) {
    clearTimeout(toast._timer);
    toast.classList.remove('show');
  }
}
window.dismissToast = dismissToast;
window.showToast = showToast;
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('show');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-veil.show, .login-veil.show, .welcome-veil.show, .agenda-veil.show').forEach(el => {
    el.classList.remove('show');
  });
  if (typeof closeLightbox === 'function') closeLightbox();
  if (typeof closeUserMenu === 'function') closeUserMenu();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});

/* ===== SVG VECTOR ICONS HELPER ===== */
const SVG_ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  soccer: '<circle cx="12" cy="12" r="10"/><path d="m12 7 3.5 2.5v4L12 16l-3.5-2.5v-4z"/><path d="m12 7V2"/><path d="m15.5 9.5 4-2"/><path d="m15.5 13.5 4 2"/><path d="m12 16v5"/><path d="m8.5 13.5-4 2"/><path d="m8.5 9.5-4-2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'
};

function svgIcon(name, size = 16, extraClass = '') {
  const inner = SVG_ICONS[name] || '';
  const cls = extraClass ? `svg-icon ${extraClass}` : 'svg-icon';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/* ===== WHATSAPP-STYLE ROW SYNC BADGE HELPER ===== */
function renderSyncBadge(syncStatus, syncId, errorMsg) {
  if (syncStatus === 'pending') {
    return `<span class="row-sync-status"><span class="sync-pill-pending" title="Menyinkronkan ke Google Sheets...">${svgIcon('loader', 11, 'svg-spinner')} Mengirim</span></span>`;
  }
  if (syncStatus === 'synced') {
    return '';
  }
  if (syncStatus === 'failed') {
    const escMsg = escapeHtml(errorMsg || 'Gagal tersinkron');
    const escId = escapeHtml(syncId || '');
    return `<span class="row-sync-status"><button type="button" class="sync-pill-failed" onclick="event.stopPropagation(); retryItemSync('${escId}')" title="${escMsg}">⚠️ Gagal • Coba lagi</button></span>`;
  }
  return '';
}

async function retryItemSync(syncId) {
  if (!syncId) return;
  showToast("Mencoba menyinkronkan kembali...", "info");
  await store.retryMutation(syncId);
  if (currentView === "klasemen") renderKlasemen();
  else if (currentView === "liga") renderligaMenu();
  else if (currentView === "event") renderEvent();
}

function liveValidatePoin(input, hintId) {
  if (!input) return;
  let val = input.value.replace(/[^0-9.,]/g, '');
  const parts = val.split(/[.,]/);
  if (parts.length > 2) {
    val = parts[0] + '.' + parts.slice(1).join('');
  }
  input.value = val;
  const parentField = input.closest('.field');
  const hint = document.getElementById(hintId);
  const trimmed = val.trim();
  if (trimmed !== '' && trimmed !== '.' && trimmed !== ',') {
    const n = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 100) {
      if (parentField) parentField.classList.add('field-invalid');
      if (hint) {
        hint.textContent = 'Maksimal nilai adalah 100';
        hint.style.display = 'block';
      }
      return false;
    }
  }
  if (parentField) parentField.classList.remove('field-invalid');
  if (hint) hint.style.display = 'none';
  return true;
}

function liveValidateSkor() {
  const inpA = document.getElementById('mSkorA');
  const inpB = document.getElementById('mSkorB');
  const hint = document.getElementById('antiDrawHint');
  if (inpA) inpA.value = inpA.value.replace(/[^0-9]/g, '');
  if (inpB) inpB.value = inpB.value.replace(/[^0-9]/g, '');
  const a = inpA ? inpA.value.trim() : '';
  const b = inpB ? inpB.value.trim() : '';
  if (a !== '' && b !== '' && a === b) {
    if (hint) {
      hint.style.color = 'var(--clay)';
      hint.style.fontWeight = '700';
      hint.textContent = '⚠️ Sistem gugur tidak boleh seri! Harus ada pemenang.';
    }
  } else {
    if (hint) {
      hint.style.color = 'var(--ink-faint)';
      hint.style.fontWeight = 'normal';
      hint.textContent = '* Sistem gugur: skor tidak boleh sama (harus ada pemenang).';
    }
  }
}
/* ===== CLOUD SYNC & API CALLS ===== */
function updateSyncStatus(status, text){
  const dots = [document.getElementById("syncDot"), document.getElementById("syncDotTop"), document.getElementById("syncDotSub")];
  const texts = [document.getElementById("syncText"), document.getElementById("syncTextTop"), document.getElementById("syncTextSub")];
  dots.forEach(d => { if(d) d.className = "sync-dot " + status; });
  texts.forEach(t => { if(t) t.textContent = text; });
}

function updateDisplayUsername(name){
  ["displayUsername", "displayUsernameTop", "displayUsernameSub"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = name || "";
  });
}

async function syncDataFromCloud(isManual = false){
  if (store.isSyncing) {
    if (isManual) showToast("Sinkronisasi sedang berlangsung...", "info");
    return;
  }
  if (isManual) showToast("Mengambil data terbaru...", "info");
  store.setAuthToken(currentAuthToken);
  const res = await store.syncFromRemote(isManual);
  if (res.status === "success") {
    fillSakanSelect();
    fillTeamSelects();
    renderSakanPills();
    if (isManual) showToast(res.local ? "Data lokal dimuat." : "Data berhasil disinkronkan!", res.local ? "info" : "success");

    if (currentView === "homepage") renderDashboard();
    if (currentView === "klasemen") renderKlasemen();
    if (currentView === "liga") renderligaMenu();
    if (currentView === "event") renderEvent();
  } else if (res.status === "busy") {
    if (isManual) showToast("Sinkronisasi sedang berlangsung...", "info");
  } else {
    if (isManual) showToast("Gagal sync ke server. Menggunakan data lokal.", true);
  }
}

async function sendToCloud(action, payload){
  try {
    const res = await store.adapter.push(action, payload, currentAuthToken);
    const isUnauthorized = res && (res.code === "ERR_UNAUTHORIZED" || res.code === "unauthorized");
    if(isUnauthorized){
      updateSyncStatus("local", "Sesi berakhir");
      forceLogout("Sesi berakhir. Silakan masuk kembali.");
      return res;
    }
    updateSyncStatus("online", res.local ? "Mode Lokal" : "Cloud Terhubung");
    return res;
  } catch(err) {
    console.error("Cloud Error:", err);
    updateSyncStatus("local", "Gagal Simpan");
    return { status: "error", message: "Gagal terhubung ke server." };
  }
}

/* ===== AUTENTIKASI SERVERLESS ===== */
function canEditField(f) {
  return currentRole === 'admin_utama';
}

function canEditKlasemenAny() {
  return Boolean(currentRole && currentRole !== 'tamu');
}

function canDeleteKlasemen() {
  return currentRole === 'admin_utama';
}

function canEditLiga() {
  return currentRole === 'admin_utama';
}

function canEditEvent() {
  return currentRole === 'admin_utama';
}

function openLoginModal() {
  const err = document.getElementById("loginError");
  if (err) err.style.display = "none";
  const pInp = document.getElementById("passwordInput");
  if (pInp) pInp.value = "";
  const m = document.getElementById("loginModal");
  if (m) m.classList.add("show");
  setTimeout(() => {
    const uInp = document.getElementById("usernameInput");
    if (uInp) uInp.focus();
  }, 100);
}

function closeLoginModal() {
  const m = document.getElementById("loginModal");
  if (m) m.classList.remove("show");
  const pInp = document.getElementById("passwordInput");
  if (pInp) pInp.value = "";
  const err = document.getElementById("loginError");
  if (err) err.style.display = "none";
}

async function login() {
  const u = document.getElementById("usernameInput").value.trim();
  const p = document.getElementById("passwordInput").value.trim();
  const err = document.getElementById("loginError");
  const btn = document.getElementById("btnLoginSubmit");

  if (!u || !p) {
    err.textContent = "Mohon lengkapi username dan password admin.";
    err.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Memverifikasi...";
  err.style.display = "none";

  try {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    });
    const json = await res.json();

    if (json.status === "success" && json.user) {
      currentUser = json.user.username;
      currentRole = json.user.role || "admin_utama";
      currentLabel = json.user.label || "Admin";
      currentAuthToken = json.token || "";

      saveSession();
      store.setAuthToken(currentAuthToken);
      closeLoginModal();
      applyUserSessionUI();
      showToast("Berhasil masuk sebagai " + currentLabel);

      // Refresh tampilan aktif agar kontrol aksi admin langsung muncul
      if (currentView === "klasemen") renderKlasemen();
      else if (currentView === "liga") renderligaMenu();
      else if (currentView === "event") renderEvent();
      else if (currentView === "homepage") renderDashboard();
    } else {
      err.textContent = json.message || "Username atau password admin salah.";
      err.style.display = "block";
      document.getElementById("passwordInput").value = "";
    }
  } catch (ex) {
    err.textContent = "Gagal menghubungi server autentikasi. Pastikan koneksi internet aktif.";
    err.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Masuk";
  }
}

function forceLogout(message) {
  currentUser = "Tamu";
  currentRole = "tamu";
  currentLabel = "Tamu";
  currentAuthToken = "";
  clearSession();
  store.setAuthToken("");
  applyUserSessionUI();
  if (message) showToast(message, true);

  // Refresh tampilan aktif agar tombol aksi admin tersembunyi
  if (currentView === "klasemen") renderKlasemen();
  else if (currentView === "liga") renderligaMenu();
  else if (currentView === "event") renderEvent();
  else if (currentView === "homepage") renderDashboard();
}

function logout() {
  if (!confirm("Keluar dari akun admin?")) return;
  forceLogout("Anda telah keluar. Mode publik (view-only) aktif.");
}

function applyUserSessionUI() {
  const isAdmin = currentRole && currentRole !== "tamu";
  const btnLogin = document.getElementById("btnLoginTrigger");
  const userMenu = document.getElementById("userMenuWrap");
  const chip = document.getElementById("roleChip");
  const avatar = document.getElementById("userAvatarInitial");
  const dropUser = document.getElementById("dropdownUsername");

  if (isAdmin) {
    if (btnLogin) btnLogin.classList.add("hidden");
    if (userMenu) userMenu.classList.remove("hidden");
    if (chip) {
      chip.textContent = currentLabel || "Admin";
      chip.className = "role-chip r-" + currentRole;
    }
    if (avatar) {
      avatar.textContent = (currentUser || "A").charAt(0).toUpperCase();
    }
    if (dropUser) {
      dropUser.textContent = currentUser || "";
    }
    updateDisplayUsername(currentUser);
  } else {
    if (btnLogin) btnLogin.classList.remove("hidden");
    if (userMenu) userMenu.classList.add("hidden");
    updateDisplayUsername("");
  }
  closeUserDropdown();
  applyAccessNotes();
}

function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("userDropdownMenu");
  const btn = document.getElementById("btnUserMenuTrigger");
  if (!menu || !btn) return;
  const isShown = menu.classList.contains("show");
  if (isShown) {
    closeUserDropdown();
  } else {
    menu.classList.add("show");
    btn.classList.add("active");
  }
}

function closeUserDropdown() {
  const menu = document.getElementById("userDropdownMenu");
  const btn = document.getElementById("btnUserMenuTrigger");
  if (menu) menu.classList.remove("show");
  if (btn) btn.classList.remove("active");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#userMenuWrap")) {
    closeUserDropdown();
  }
});

function switchView(view, pushToHistory = true){
  if (view === "beranda") view = "homepage";
  currentView=view;
  saveSession();

  // Kembalikan posisi scroll ke atas setiap berpindah halaman
  window.scrollTo({ top: 0, behavior: "instant" });

  // Push state ke browser history agar saat tombol Back ditekan tidak langsung keluar web
  if(pushToHistory){
    history.pushState({ view: view }, "", "#" + view);
  }

  // Update navigasi mobile (HP)
  document.querySelectorAll(".mobile-nav-item").forEach(b => {
    b.classList.toggle("active", b.id === "mNav-" + view);
  });

  // Update navigasi desktop (button group pills di topbar)
  document.querySelectorAll(".nav-pill-btn").forEach(b => {
    b.classList.toggle("active", b.id === "nav-" + view);
  });

  // Toggle visibilitas halaman
  const isHome = (view === 'homepage');
  const vHome = document.getElementById("view-homepage");
  if(vHome) vHome.classList.toggle("hidden", !isHome);

  ["klasemen", "liga", "event"].forEach(p => {
    const el = document.getElementById("page-" + p);
    if(el) el.classList.toggle("hidden", p !== view);
  });

  if(isHome) {
    renderDashboard();
  } else {
    if(view === "klasemen") renderKlasemen();
    if(view === "liga") renderligaMenu();
    if(view === "event") renderEvent();
  }
}

/* Event Listener untuk Menangani Tombol Back Browser/HP */
window.addEventListener("popstate", function (e) {
  if (e.state && e.state.view) {
    switchView(e.state.view, false);
  } else {
    const hash = window.location.hash.replace("#", "");
    if (["homepage", "klasemen", "liga", "event"].includes(hash)) {
      switchView(hash, false);
    } else {
      switchView("homepage", false);
    }
  }
});

function scrollToSakan(){
  if(currentView !== 'homepage'){
    switchView('homepage');
  }
  setTimeout(()=>{
    const el=document.getElementById("sakanSection");
    if(el) el.scrollIntoView({behavior:'smooth'});
  }, 100);
}

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  document.getElementById("panelHarian").classList.toggle("hidden",tab!=="harian");
  document.getElementById("panelRekap").classList.toggle("hidden",tab!=="rekap");
}

function applyAccessNotes(){
  const addK = document.getElementById("addKlasemenBtn");
  if(addK) addK.classList.toggle("hidden",!canEditKlasemenAny());
  const addBulkK = document.getElementById("addBulkKlasemenBtn");
  if(addBulkK) addBulkK.classList.toggle("hidden",!canEditKlasemenAny());
  const ah = document.getElementById("actionHead");
  if(ah) ah.classList.toggle("hidden",!canEditKlasemenAny());

  const addJb = document.getElementById("addJadwalBolaBtn");
  if(addJb) addJb.classList.toggle("hidden",!canEditLiga());
  const mb = document.getElementById("addMatchBtn");
  if(mb) mb.classList.toggle("hidden",!canEditLiga());
  const mah = document.getElementById("matchActionHead");
  if(mah) mah.classList.toggle("hidden",!canEditLiga());

  const addEb = document.getElementById("addEventBtn");
  if(addEb) addEb.classList.toggle("hidden",!canEditEvent());
}

/* =========================================================================
   MODUL 0: DASHBOARD UTAMA (RINGKASAN & SOROTAN REAL-TIME)
   ========================================================================= */
function renderDashboard() {
  // 1. Greeting Dinamis
  const greetTitle = document.getElementById("dashGreetingTitle");
  if (greetTitle) {
    const isLogged = currentRole && currentRole !== "tamu";
    if (isLogged) {
      const displayName = escapeHtml(currentLabel || currentUser || "Admin");
      greetTitle.innerHTML = `Ahlan wa Sahlan, <span>${displayName}</span>`;
    } else {
      greetTitle.innerHTML = `Ahlan wa Sahlan di <span>Liga Kebaikan</span>`;
    }
  }

  const greetDate = document.getElementById("dashGreetingDate");
  if (greetDate) {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    greetDate.textContent = dateFormatted;
  }

  // 2. Agregasi Klasemen Kebaikan via StandingsEngine (In-Process)
  const listRekap = StandingsEngine.computeSummary(store.getKlasemen());
  const topSakan = listRekap.length ? listRekap[0] : null;
  const statTop = document.getElementById("dashStatTopSakan");
  const statTopLbl = document.getElementById("dashStatTopSakanLbl");
  const cardTop = document.getElementById("dashHeroMetricTopSakan");

  if (statTop) {
    if (topSakan && topSakan.jumlah > 0) {
      statTop.textContent = formatTitleCase(topSakan.sakan);
      statTop.title = `${formatTitleCase(topSakan.sakan)} (${topSakan.avgCombined} pts)`;
      if (statTopLbl) statTopLbl.textContent = `Peringkat 1 • ${topSakan.avgCombined} Poin`;
      if (cardTop) cardTop.title = `Pemimpin Kehormatan Adab: ${formatTitleCase(topSakan.sakan)} (${topSakan.avgCombined} pts)`;
    } else {
      statTop.textContent = "Belum Ada Nilai";
      statTop.title = "Belum ada penilaian adab";
      if (statTopLbl) statTopLbl.textContent = "Pemimpin Kebaikan";
      if (cardTop) cardTop.title = "Belum ada rekap nilai adab sakan";
    }
  }

  // Helper pemotong judul agenda agar tipografi kartu metrik tetap rapi dan tidak terpotong canggung
  function formatEventTitle(title) {
    if (!title) return "";
    const clean = formatTitleCase(title);
    if (clean.length <= 18) return clean;
    const sub = clean.slice(0, 18);
    const lastSpace = sub.lastIndexOf(" ");
    return lastSpace > 6 ? sub.slice(0, lastSpace) : sub;
  }

  // 4. Data & Metrik Turnamen Bola via TournamentEngine (In-Process)
  const { jadwalList, hasilList, liveMatch } = TournamentEngine.partitionMatches(store.getMatches());
  const statLaga = document.getElementById("dashStatLaga");
  const statLagaLbl = document.getElementById("dashStatLagaLbl");
  const cardLaga = document.getElementById("dashHeroMetricLaga");

  if (statLaga) {
    if (liveMatch) {
      const matchTitle = `${formatTitleCase(liveMatch.timA)} vs ${formatTitleCase(liveMatch.timB)}`;
      statLaga.innerHTML = `<span style="color:var(--clay); font-weight:700;"><span class="dash-live-dot"></span>${escapeHtml(matchTitle)}</span>`;
      statLaga.title = matchTitle;
      if (statLagaLbl) statLagaLbl.textContent = liveMatch.waktu ? `Sedang Main • ${liveMatch.waktu}` : 'Sedang Main';
      if (cardLaga) cardLaga.title = `Sedang Main: ${matchTitle} (${liveMatch.lokasi || 'Lapangan'})`;
    } else if (jadwalList.length) {
      const todayMatches = jadwalList.filter(m => eventStatus(m.tanggal).cls === "today");
      const targetMatch = todayMatches.length ? todayMatches[0] : jadwalList[0];
      const isToday = eventStatus(targetMatch.tanggal).cls === "today";
      const matchTitle = `${formatTitleCase(targetMatch.timA)} vs ${formatTitleCase(targetMatch.timB)}`;

      statLaga.textContent = matchTitle;
      statLaga.title = matchTitle;
      if (statLagaLbl) {
        if (isToday) {
          statLagaLbl.textContent = targetMatch.waktu ? `Hari Ini • ${targetMatch.waktu}` : 'Hari Ini';
        } else {
          statLagaLbl.textContent = `${formatShortDate(targetMatch.tanggal, true)}${targetMatch.waktu ? ' • ' + targetMatch.waktu : ''}`;
        }
      }
      if (cardLaga) cardLaga.title = `${formatTitleCase(targetMatch.round || 'Laga')}: ${matchTitle} (${formatTanggal(targetMatch.tanggal)}${targetMatch.waktu ? ' • ' + targetMatch.waktu : ''})`;
    } else if (hasilList.length) {
      const bracket = TournamentEngine.buildBracket(store.getMatches());
      if (bracket.isDecided && bracket.champion) {
        statLaga.textContent = `${formatTitleCase(bracket.champion)} (Juara)`;
        statLaga.title = `Juara: ${formatTitleCase(bracket.champion)}`;
        if (statLagaLbl) statLagaLbl.textContent = "Turnamen Selesai 🏆";
        if (cardLaga) cardLaga.title = `Juara Utama Turnamen: ${formatTitleCase(bracket.champion)}`;
      } else {
        const lastMatch = hasilList[hasilList.length - 1];
        const matchTitle = `${formatTitleCase(lastMatch.timA)} vs ${formatTitleCase(lastMatch.timB)}`;
        statLaga.textContent = matchTitle;
        statLaga.title = matchTitle;
        if (statLagaLbl) statLagaLbl.textContent = `${hasilList.length} Laga Selesai`;
        if (cardLaga) cardLaga.title = `Hasil Terakhir: ${formatTitleCase(lastMatch.timA)} ${lastMatch.skorA} - ${lastMatch.skorB} ${formatTitleCase(lastMatch.timB)}`;
      }
    } else {
      statLaga.textContent = "Belum Ada Laga";
      statLaga.title = "Belum ada jadwal";
      if (statLagaLbl) statLagaLbl.textContent = "Turnamen Bola";
      if (cardLaga) cardLaga.title = "Belum ada jadwal pertandingan bola";
    }
  }

  // 5. Data & Metrik Agenda Event
  const listEvent = [...dataEvent].sort((a, b) => (String(a.tanggal || '') + String(a.waktu || '')).localeCompare(String(b.tanggal || '') + String(b.waktu || '')));
  const upcomingEvents = listEvent.filter(e => {
    const st = eventStatus(e.tanggal);
    return st.cls === "today" || st.cls === "upcoming";
  });

  const statEvent = document.getElementById("dashStatEvent");
  const statEventLbl = document.getElementById("dashStatEventLbl");
  const cardEvent = document.getElementById("dashHeroMetricEvent");

  if (statEvent) {
    if (upcomingEvents.length) {
      const todayEvents = upcomingEvents.filter(e => eventStatus(e.tanggal).cls === "today");
      const targetEvent = todayEvents.length ? todayEvents[0] : upcomingEvents[0];
      const isToday = eventStatus(targetEvent.tanggal).cls === "today";
      const eventTitle = formatTitleCase(targetEvent.judul);
      const displayTitle = formatEventTitle(targetEvent.judul);

      statEvent.textContent = displayTitle;
      statEvent.title = eventTitle;
      if (statEventLbl) {
        if (isToday) {
          statEventLbl.textContent = targetEvent.waktu ? `Hari Ini • ${targetEvent.waktu}` : 'Hari Ini';
        } else {
          statEventLbl.textContent = `${formatShortDate(targetEvent.tanggal, true)}${targetEvent.waktu ? ' • ' + targetEvent.waktu : ''}`;
        }
      }
      if (cardEvent) cardEvent.title = `${eventTitle} (${formatTanggal(targetEvent.tanggal)}${targetEvent.waktu ? ' • ' + targetEvent.waktu : ''}${targetEvent.lokasi ? ' • ' + targetEvent.lokasi : ''})`;
    } else if (listEvent.length) {
      statEvent.textContent = "Semua Selesai";
      statEvent.title = "Seluruh agenda selesai";
      if (statEventLbl) statEventLbl.textContent = "Agenda Selesai";
      if (cardEvent) cardEvent.title = "Seluruh agenda 3 pekan telah selesai terlaksana";
    } else {
      statEvent.textContent = "Belum Ada Agenda";
      statEvent.title = "Belum ada agenda";
      if (statEventLbl) statEventLbl.textContent = "Agenda Pesantren";
      if (cardEvent) cardEvent.title = "Belum ada agenda kegiatan terdaftar";
    }
  }

  // 6. Render Konten Masing-Masing Widget
  renderDashKlasemenWidget(listRekap, topSakan);
  renderDashTurnamenWidget(liveMatch, jadwalList, hasilList);
  renderDashEventWidget(upcomingEvents, listEvent);
  renderSakanPills();
}

function renderDashKlasemenWidget(listRekap, topSakan) {
  const container = document.getElementById("dashKlasemenContent");
  if (!container) return;

  const hasValidData = listRekap.length > 0 && listRekap.some(r => r.jumlah > 0);

  if (!hasValidData) {
    container.innerHTML = `
      <div class="dash-empty-state">
        <div class="dash-empty-icon">${svgIcon('trophy', 32)}</div>
        <p>Belum ada data penilaian kebaikan tercatat.</p>
        <button class="btn btn-ghost" style="font-size:12px; margin-top:8px;" onclick="switchView('klasemen')">Buka Klasemen</button>
      </div>
    `;
    return;
  }

  // MVP Card (Sakan Teladan #1)
  const totalRanked = listRekap.filter(r => r.jumlah > 0).length;
  let html = `
    <div class="dash-mvp-card">
      <div class="dash-mvp-top">
        <div class="dash-mvp-badge">${svgIcon('crown', 12)} Sakan Teladan Pekan Ini</div>
        <span class="dash-mvp-rank-hint">Peringkat 1 dari ${totalRanked}</span>
      </div>
      <div class="dash-mvp-main">
        <div class="dash-mvp-name">${escapeHtml(formatTitleCase(topSakan.sakan))}</div>
        <div class="dash-mvp-score">${topSakan.avgCombined} <span>/100</span></div>
      </div>
      <div class="dash-mvp-tiles">
        <div class="dash-mvp-tile">
          <span class="dash-mvp-tile-label">Kebersihan</span>
          <strong class="dash-mvp-tile-val">${topSakan.avgKeb}</strong>
        </div>
        <div class="dash-mvp-tile">
          <span class="dash-mvp-tile-label">Kedisiplinan</span>
          <strong class="dash-mvp-tile-val">${topSakan.avgKed}</strong>
        </div>
        <div class="dash-mvp-tile">
          <span class="dash-mvp-tile-label">Bahasa</span>
          <strong class="dash-mvp-tile-val">${topSakan.avgBah}</strong>
        </div>
      </div>
    </div>
  `;

  // Runner-Up #2 dan #3 (Unified Ledger Table, No Box-in-Box)
  const runnerUps = listRekap.slice(1, 3).filter(r => r.jumlah > 0);
  if (runnerUps.length > 0) {
    html += '<div class="dash-runner-ledger">';
    runnerUps.forEach((r, idx) => {
      const rankNum = r.rank || (idx + 2);
      html += `
        <div class="dash-runner-row">
          <div class="dash-runner-left">
            <span class="dash-runner-rank">${rankNum}</span>
            <span class="dash-runner-name">${escapeHtml(formatTitleCase(r.sakan))}</span>
          </div>
          <span class="dash-runner-score">Avg ${r.avgCombined}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  // Hitung rata-rata global
  let totalScore = 0, countTotal = 0;
  listRekap.forEach(r => {
    if (r.jumlah > 0) {
      totalScore += r.avgCombined;
      countTotal++;
    }
  });
  if (countTotal > 0) {
    const globalAvg = (totalScore / countTotal).toFixed(1);
    html += `<div class="dash-ledger-footer">${svgIcon('award', 13)} <span>Rata-rata kebaikan seluruh sakan: <strong>${globalAvg}</strong></span></div>`;
  }

  container.innerHTML = html;
}

function renderDashTurnamenWidget(liveMatch, jadwalList, hasilList) {
  const container = document.getElementById("dashTurnamenContent");
  if (!container) return;

  const matchesToShow = [];

  if (liveMatch) {
    matchesToShow.push({ match: liveMatch, type: 'live' });
    if (jadwalList.length > 0) {
      matchesToShow.push({ match: jadwalList[0], type: 'scheduled' });
    } else if (hasilList.length > 0) {
      matchesToShow.push({ match: hasilList[0], type: 'result' });
    }
  } else if (jadwalList.length > 0) {
    matchesToShow.push({ match: jadwalList[0], type: 'scheduled' });
    if (jadwalList.length > 1) {
      matchesToShow.push({ match: jadwalList[1], type: 'scheduled' });
    } else if (hasilList.length > 0) {
      matchesToShow.push({ match: hasilList[0], type: 'result' });
    }
  } else if (hasilList.length > 0) {
    matchesToShow.push({ match: hasilList[0], type: 'result' });
    if (hasilList.length > 1) {
      matchesToShow.push({ match: hasilList[1], type: 'result' });
    }
  }

  if (matchesToShow.length === 0) {
    container.innerHTML = `
      <div class="dash-empty-state">
        <div class="dash-empty-icon">${svgIcon('soccer', 32)}</div>
        <p>Belum ada jadwal pertandingan bola yang aktif.</p>
        <button class="btn btn-ghost" style="font-size:12px; margin-top:8px;" onclick="switchView('liga')">Buka Bagan Turnamen</button>
      </div>
    `;
    return;
  }

  let html = '';
  matchesToShow.forEach(({ match, type }) => {
    const isLive = type === 'live';
    const isComplete = type === 'result';
    const sA = Number(match.skorA);
    const sB = Number(match.skorB);
    const isAWin = isComplete && !isNaN(sA) && !isNaN(sB) && sA > sB;
    const isBWin = isComplete && !isNaN(sA) && !isNaN(sB) && sB > sA;

    const initialA = getTeamInitial(match.timA);
    const initialB = getTeamInitial(match.timB);
    const nameA = escapeHtml(formatTitleCase(match.timA));
    const nameB = escapeHtml(formatTitleCase(match.timB));
    const venueName = escapeHtml(match.lokasi || "Lapangan Pesantren");

    if (type === 'live') {
      html += `
        <div class="dash-match-box live">
          <div class="dash-match-meta">
            <span class="dash-match-round-tag"><span class="dash-live-dot"></span>${escapeHtml(formatTitleCase(match.round || "Pertandingan"))} ${renderSyncBadge(match._syncStatus, match._syncId, match._syncError)}</span>
            <span class="dash-match-status-badge live"><span class="dash-live-dot" style="background:#fff;"></span>Sedang Main</span>
          </div>
          <div class="dash-match-arena">
            <div class="dash-match-team-col">
              <div class="dash-match-avatar">${initialA}</div>
              <div class="dash-match-team-name">${nameA}</div>
            </div>
            <div class="dash-match-center-pillar">
              <div class="dash-match-score-pill">
                <div class="dash-match-score-val">${match.skorA != null && match.skorA !== '' ? match.skorA : '0'} - ${match.skorB != null && match.skorB !== '' ? match.skorB : '0'}</div>
                <div class="dash-match-score-lbl">LIVE</div>
              </div>
            </div>
            <div class="dash-match-venue-sub" title="${venueName}">
              ${svgIcon('map-pin', 11)} <span>${venueName}</span>
            </div>
            <div class="dash-match-team-col right">
              <div class="dash-match-avatar">${initialB}</div>
              <div class="dash-match-team-name">${nameB}</div>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'scheduled') {
      const st = eventStatus(match.tanggal);
      const cleanWaktu = match.waktu ? match.waktu.replace(/\s*WIB/i, '').trim() : '15:30';
      const timeSubLbl = st.cls === 'today' ? 'WIB' : formatShortDate(match.tanggal);

      html += `
        <div class="dash-match-box">
          <div class="dash-match-meta">
            <span class="dash-match-round-tag">${escapeHtml(formatTitleCase(match.round || "Pertandingan"))} ${renderSyncBadge(match._syncStatus, match._syncId, match._syncError)}</span>
            <span class="dash-match-status-badge ${st.cls}">${st.label}</span>
          </div>
          <div class="dash-match-arena">
            <div class="dash-match-team-col">
              <div class="dash-match-avatar">${initialA}</div>
              <div class="dash-match-team-name">${nameA}</div>
            </div>
            <div class="dash-match-center-pillar">
              <div class="dash-match-time-pill">
                <div class="dash-match-time-val">${cleanWaktu}</div>
                <div class="dash-match-time-lbl">${timeSubLbl}</div>
              </div>
            </div>
            <div class="dash-match-venue-sub" title="${venueName}">
              ${svgIcon('map-pin', 11)} <span>${venueName}</span>
            </div>
            <div class="dash-match-team-col right">
              <div class="dash-match-avatar">${initialB}</div>
              <div class="dash-match-team-name">${nameB}</div>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'result') {
      html += `
        <div class="dash-match-box">
          <div class="dash-match-meta">
            <span class="dash-match-round-tag">${escapeHtml(formatTitleCase(match.round || "Hasil Laga"))} ${renderSyncBadge(match._syncStatus, match._syncId, match._syncError)}</span>
            <span class="dash-match-status-badge past">Selesai</span>
          </div>
          <div class="dash-match-arena">
            <div class="dash-match-team-col">
              <div class="dash-match-avatar ${isAWin ? 'winner-av' : ''}">${initialA}</div>
              <div class="dash-match-team-name ${isAWin ? 'winner' : (isBWin ? 'loser' : '')}">${nameA}</div>
            </div>
            <div class="dash-match-center-pillar">
              <div class="dash-match-score-pill">
                <div class="dash-match-score-val">${match.skorA} - ${match.skorB}</div>
                <div class="dash-match-score-lbl">FT</div>
              </div>
            </div>
            <div class="dash-match-venue-sub" title="${venueName}">
              ${svgIcon('map-pin', 11)} <span>${venueName}</span>
            </div>
            <div class="dash-match-team-col right">
              <div class="dash-match-avatar ${isBWin ? 'winner-av' : ''}">${initialB}</div>
              <div class="dash-match-team-name ${isBWin ? 'winner' : (isAWin ? 'loser' : '')}">${nameB}</div>
            </div>
          </div>
        </div>
      `;
    }
  });

  const remainingScheduled = jadwalList.length - matchesToShow.filter(m => m.type === 'scheduled').length;
  if (remainingScheduled > 0) {
    html += `<div class="dash-avg-summary" style="padding-top:2px;">+${remainingScheduled} jadwal laga lainnya di bagan</div>`;
  }

  container.innerHTML = html;
}

function renderDashEventWidget(upcomingEvents, listEvent) {
  const container = document.getElementById("dashEventContent");
  if (!container) return;

  const displayList = upcomingEvents.length > 0 ? upcomingEvents.slice(0, 2) : listEvent.slice(0, 1);

  if (!displayList.length) {
    container.innerHTML = `
      <div class="dash-empty-state">
        <div class="dash-empty-icon">${svgIcon('calendar', 32)}</div>
        <p>Belum ada agenda atau kegiatan pesantren.</p>
        <button class="btn btn-ghost" style="font-size:12px; margin-top:8px;" onclick="switchView('event')">Buka Kalender Agenda</button>
      </div>
    `;
    return;
  }

  container.innerHTML = displayList.map(e => {
    let dNum = "–", dMonth = "–";
    let strDate = String(e.tanggal || "").trim();
    if (strDate.includes("T")) strDate = strDate.split("T")[0];
    const parts = strDate.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) {
        dNum = dateObj.toLocaleDateString("id-ID", { day: "numeric" });
        dMonth = dateObj.toLocaleDateString("id-ID", { month: "short" });
      }
    }

    const st = eventStatus(e.tanggal);
    const safeFoto = sanitizeImageUrl(e.foto);
    const photoTag = safeFoto ? `<img src="${safeFoto}" class="dash-event-thumb js-lightbox-trigger" alt="Poster Kegiatan" title="Klik untuk perbesar" data-src="${safeFoto}">` : '';

    return `
      <div class="dash-event-item">
        <div class="dash-date-box">
          <div class="dash-date-num">${dNum}</div>
          <div class="dash-date-month">${dMonth}</div>
        </div>
        <div class="dash-event-info">
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:3px; flex-wrap:wrap;">
            <span style="font-size:11px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--parchment-dim); color:var(--ink-soft);">${escapeHtml(e.kategori || "Umum")}</span>
            <span style="font-size:11px; font-weight:700; padding:1px 7px; border-radius:999px; background:${st.cls === 'today' ? 'var(--gold-deep)' : st.cls === 'upcoming' ? 'var(--green-subtle)' : 'var(--parchment-dim)'}; color:${st.cls === 'today' ? '#fff' : st.cls === 'upcoming' ? 'var(--green-ok)' : 'var(--ink-faint)'}; border:1px solid ${st.cls === 'upcoming' ? 'var(--green-border)' : 'transparent'};">${st.label}</span>
          </div>
          <div class="dash-event-title">${escapeHtml(e.judul)} ${renderSyncBadge(e._syncStatus, e._syncId, e._syncError)}</div>
          <div class="dash-event-meta">
            <span>${svgIcon('clock', 12)} ${formatWaktu(e.waktu)}</span>
            <span>${svgIcon('map-pin', 12)} ${escapeHtml(e.lokasi || "Pesantren")}</span>
          </div>
        </div>
        ${photoTag}
      </div>
    `;
  }).join("");
}

/* =========================================================================
   MODUL 1: KLASEMEN KEBAIKAN
   ========================================================================= */
function findKlasemenRecord(tanggal, sakan) {
  return dataKlasemen.find(i => i.tanggal === tanggal && i.sakan === sakan);
}

function resetFilter() {
  document.getElementById('filterTanggal').value = '';
  document.getElementById('searchInput').value = '';
  renderKlasemen();
}

function renderKlasemen(){
  applyAccessNotes();
  const date = document.getElementById("filterTanggal").value;
  const q = document.getElementById("searchInput").value.trim();

  // 1. Hitung data via StandingsEngine (In-Process)
  const dailyRows = StandingsEngine.computeDailyStandings(store.getKlasemen(), { tanggal: date, query: q });
  const listRekap = StandingsEngine.computeSummary(store.getKlasemen(), { query: q });
  const metrics = StandingsEngine.computeMetrics(store.getKlasemen(), { tanggal: date, query: q });
  const podiumData = StandingsEngine.extractPodium(listRekap);

  document.getElementById("statAvgKeb").textContent = metrics.avgKeb;
  document.getElementById("statAvgKed").textContent = metrics.avgKed;
  document.getElementById("statAvgBah").textContent = metrics.avgBah;
  document.getElementById("statAvgTotal").textContent = metrics.avgCombined;
  
  const pod = document.getElementById("podium");
  if (!podiumData.hasData) {
    pod.innerHTML = '<div class="podium-empty">Belum ada data.</div>';
  } else {
    pod.innerHTML = '<div class="podium">' + podiumData.slots.map(s => 
      '<div class="podium-slot ' + s.cssClass + '">' +
        '<div class="name">' + escapeHtml(formatTitleCase(s.sakan)) + '</div>' +
        '<div class="pts">Avg: ' + s.score + '</div>' +
        '<div class="podium-block">' + s.rank + '</div>' +
      '</div>'
    ).join("") + '</div>';
  }
  
  const isAdmin = canEditKlasemenAny();
  const tbody = document.getElementById("harianTbody");
  if (!dailyRows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + (isAdmin ? 8 : 7) + '">Tidak ada data.</td></tr>';
  } else {
    tbody.innerHTML = dailyRows.map((item) => {
      const kebStr = item.kebersihan == null ? '<span class="pill empty">–</span>' : '<span class="pill">' + item.kebersihan + '</span>';
      const kedStr = item.kedisiplinan == null ? '<span class="pill empty">–</span>' : '<span class="pill">' + item.kedisiplinan + '</span>';
      const bahStr = item.bahasa == null ? '<span class="pill empty">–</span>' : '<span class="pill">' + item.bahasa + '</span>';
      const avgStr = item.rowAvg == null ? '<span class="pill empty">–</span>' : '<span class="pill total">' + item.rowAvg.toFixed(1) + '</span>';

      const sakanEsc = item.sakan.replace(/'/g, "\\'");
      const syncBadge = renderSyncBadge(item._syncStatus, item._syncId, item._syncError);
      return '<tr><td class="center"><span class="rank-num">' + item.rank + '</span></td><td>' + formatTanggal(item.tanggal) + '</td><td class="sakan-name">' + escapeHtml(formatTitleCase(item.sakan)) + (syncBadge ? ' ' + syncBadge : '') + '</td><td class="center">' + kebStr + '</td><td class="center">' + kedStr + '</td><td class="center">' + bahStr + '</td><td class="center">' + avgStr + '</td>' + (isAdmin ? '<td class="center"><div class="row-actions"><button class="icon-btn" title="Edit" onclick="editKlasemen(\'' + item.tanggal + '\',\'' + sakanEsc + '\')">' + svgIcon('edit', 14) + '</button>' + (canDeleteKlasemen() ? '<button class="icon-btn danger" title="Hapus" onclick="hapusKlasemen(\'' + item.tanggal + '\',\'' + sakanEsc + '\')">' + svgIcon('trash', 14) + '</button>' : '') + '</div></td>' : '') + '</tr>';
    }).join("");
  }
  
  const rt=document.getElementById("rekapTbody");
  if(!listRekap.length){rt.innerHTML='<tr class="empty-row"><td colspan="7">Belum ada rekap.</td></tr>';}
  else{
    rt.innerHTML=listRekap.map((r,i)=> {
      const syncBadge = renderSyncBadge(r._syncStatus, r._syncId, r._syncError);
      return '<tr>'+
      '<td class="center"><span class="rank-num">'+(i+1)+'</span></td>'+
      '<td class="sakan-name">'+escapeHtml(formatTitleCase(r.sakan)) + (syncBadge ? ' ' + syncBadge : '') +'</td>'+
      '<td class="center">'+r.jumlah+'×</td>'+
      '<td class="center"><span class="pill">'+r.avgKeb+'</span></td>'+
      '<td class="center"><span class="pill">'+r.avgKed+'</span></td>'+
      '<td class="center"><span class="pill">'+r.avgBah+'</span></td>'+
      '<td class="center"><span class="pill total">'+r.avgCombined+'</span></td>'+
      '</tr>';
    }).join("");
  }
}

function getActiveGedungList() {
  if (Array.isArray(dataGedung) && dataGedung.length > 0) {
    const list = dataGedung
      .filter(g => g && (typeof g === "string" || (g.nama && String(g.nama).trim())))
      .map(g => {
        if (typeof g === "string") {
          return { id: g.toLowerCase().replace(/\s+/g, '-'), nama: g.trim(), urutan: 999, aktif: true };
        }
        return {
          id: g.id || String(g.nama).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          nama: String(g.nama).trim(),
          urutan: Number(g.urutan) || 999,
          aktif: g.aktif !== false && String(g.aktif).toLowerCase() !== "false"
        };
      })
      .filter(g => g.aktif)
      .sort((a, b) => a.urutan - b.urutan);
    if (list.length > 0) return list;
  }

  // Fallback 1: Ekstrak dari master sakan yang memiliki atribut gedung
  const sakanRaw = typeof dataSakan !== "undefined" && Array.isArray(dataSakan) ? dataSakan : [];
  const fromSakan = [...new Set(sakanRaw.map(s => s && s.gedung ? String(s.gedung).trim() : '').filter(Boolean))];
  if (fromSakan.length > 0) {
    return fromSakan.sort().map((nama, idx) => ({
      id: nama.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      nama,
      urutan: idx + 1,
      aktif: true
    }));
  }

  // Fallback 2: Ekstrak dari riwayat turnamen liga (tim turnamen adalah gedung)
  const ligaList = typeof store !== "undefined" && store.getLiga ? store.getLiga() : [];
  if (Array.isArray(ligaList) && ligaList.length > 0) {
    const teams = new Set();
    ligaList.forEach(m => {
      if (m.timA && String(m.timA).trim()) teams.add(String(m.timA).trim());
      if (m.timB && String(m.timB).trim()) teams.add(String(m.timB).trim());
    });
    if (teams.size > 0) {
      return [...teams].sort().map((nama, idx) => ({
        id: nama.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        nama,
        urutan: idx + 1,
        aktif: true
      }));
    }
  }

  // Fallback 3: Gedung kota peradaban Islam standar
  const defaultGedung = ['QAZVIN', 'NAISABUR', 'BUKHARA', 'HAMADAN', 'TIRMIDZ', 'SIJISTAN'];
  return defaultGedung.map((nama, idx) => ({
    id: nama.toLowerCase(),
    nama,
    urutan: idx + 1,
    aktif: true
  }));
}

function getActiveSakanList() {
  if (Array.isArray(dataSakan) && dataSakan.length > 0) {
    return dataSakan
      .filter(s => s && (typeof s === "string" || (s.nama && String(s.nama).trim())))
      .map(s => {
        if (typeof s === "string") {
          return { id: s.toLowerCase().replace(/\s+/g, '-'), nama: s.trim(), gedung: "", urutan: 999, aktif: true };
        }
        return {
          id: s.id || String(s.nama).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          nama: String(s.nama).trim(),
          gedung: String(s.gedung || "").trim(),
          urutan: Number(s.urutan) || 999,
          aktif: s.aktif !== false && String(s.aktif).toLowerCase() !== "false"
        };
      })
      .filter(s => s.aktif)
      .sort((a, b) => a.urutan - b.urutan);
  }
  // Fallback jika master dataSakan belum tersedia/disinkron, ekstrak dari riwayat klasemen
  const klasemen = typeof store !== "undefined" && store.getKlasemen ? store.getKlasemen() : [];
  if (Array.isArray(klasemen) && klasemen.length > 0) {
    const unique = [...new Set(klasemen.map(k => String(k.sakan || '').trim()).filter(Boolean))];
    return unique.sort().map((nama, idx) => ({
      id: nama.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      nama,
      gedung: "",
      urutan: idx + 1,
      aktif: true
    }));
  }
  return [];
}

function renderSakanPills() {
  const container = document.getElementById("pubSakanPills");
  if (!container) return;
  const list = getActiveGedungList();
  if (!list.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = list.map(g => {
    const nameFormatted = formatTitleCase(g.nama);
    const initial = nameFormatted.charAt(0).toUpperCase();
    return `
      <div class="pub-pill" onclick="filterKlasemenByGedung('${escapeHtml(g.nama)}')" title="Lihat klasemen asrama di Gedung ${escapeHtml(nameFormatted)}">
        <span class="pub-pill-dot">${initial}</span>
        <span>${escapeHtml(nameFormatted)}</span>
      </div>
    `;
  }).join('');
}

function filterKlasemenByGedung(gedungName) {
  if (typeof switchView === "function") switchView("klasemen");
  const search = document.getElementById("searchInput");
  if (search) {
    search.value = formatTitleCase(gedungName);
    if (typeof renderKlasemen === "function") renderKlasemen();
  }
}

function fillSakanSelect() {
  const sel = document.getElementById('kSakan');
  if (!sel) return;
  const list = getActiveSakanList();
  if (list.length === 0) {
    sel.innerHTML = '<option value="">— Belum ada data sakan —</option>';
    return;
  }

  // Jika ada sakan dengan informasi gedung, kelompokkan dengan optgroup
  const hasGedung = list.some(s => s.gedung && String(s.gedung).trim());
  if (!hasGedung) {
    sel.innerHTML = '<option value="">— Pilih Sakan —</option>' + 
      list.map(s => '<option value="' + escapeHtml(s.nama) + '">' + escapeHtml(s.nama) + '</option>').join('');
    return;
  }

  const groups = {};
  list.forEach(s => {
    const g = String(s.gedung || 'Lainnya').trim();
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  });

  let html = '<option value="">— Pilih Sakan —</option>';
  Object.keys(groups).forEach(gName => {
    html += '<optgroup label="Gedung ' + escapeHtml(gName) + '">';
    html += groups[gName].map(s => '<option value="' + escapeHtml(s.nama) + '">' + escapeHtml(s.nama) + '</option>').join('');
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function fillTeamSelects() {
  const list = getActiveGedungList();
  const elA = document.getElementById('mTimA');
  const elB = document.getElementById('mTimB');
  if (list.length === 0) {
    const emptyOpt = '<option value="">— Belum ada data gedung —</option>';
    if (elA) elA.innerHTML = emptyOpt;
    if (elB) elB.innerHTML = emptyOpt;
    return;
  }
  const opts = '<option value="">— Pilih Gedung / Tim —</option>' + 
    list.map(g => '<option value="' + escapeHtml(g.nama) + '">' + escapeHtml(g.nama) + '</option>').join('');
  if (elA) elA.innerHTML = opts;
  if (elB) elB.innerHTML = opts;
}

function onKlasemenKeyChange(){
  const t=document.getElementById("kTanggal").value, s=document.getElementById("kSakan").value;
  const ex=(t&&s)?findKlasemenRecord(t,s):null;
  document.getElementById("dupeNote").style.display=(ex&&(!editingKlasemenKey||(editingKlasemenKey.tanggal!==t||editingKlasemenKey.sakan!==s)))?"block":"none";
  fillKlasemenFields(ex);
}
function fillKlasemenFields(ex){
  const set=(id,f)=>{
    const inp=document.getElementById(id);
    inp.value=ex&&ex[f]!=null?ex[f]:"";
    inp.disabled=false;
    inp.placeholder="Belum diisi";
  };
  set("fKebersihan","kebersihan");set("fKedisiplinan","kedisiplinan");set("fBahasa","bahasa");
}
function openKlasemenModal(){
  editingKlasemenKey=null;fillSakanSelect();
  document.getElementById("modalKlasemenTitle").textContent="Tambah Poin";
  document.getElementById("kTanggal").value=todayStr();document.getElementById("kTanggal").disabled=false;
  document.getElementById("kSakan").value="";document.getElementById("kSakan").disabled=false;
  document.getElementById("dupeNote").style.display="none";fillKlasemenFields(null);
  document.getElementById("modalKlasemen").classList.add("show");
}
function editKlasemen(t,s){
  const rec=findKlasemenRecord(t,s);if(!rec)return;
  editingKlasemenKey={tanggal:t,sakan:s};fillSakanSelect();
  document.getElementById("modalKlasemenTitle").textContent="Edit Poin";
  document.getElementById("kTanggal").value=t;document.getElementById("kTanggal").disabled=true;
  document.getElementById("kSakan").value=s;document.getElementById("kSakan").disabled=true;
  document.getElementById("dupeNote").style.display="none";fillKlasemenFields(rec);
  document.getElementById("modalKlasemen").classList.add("show");
}

async function simpanKlasemen(){
  const rawT = document.getElementById("kTanggal").value;
  const s = document.getElementById("kSakan").value;
  const t = normalizeDateStr(rawT);
  
  const rd = (id) => {
    const inp = document.getElementById(id);
    const v = inp ? inp.value.trim() : "";
    return v === "" ? null : v;
  };
  const nk = rd("fKebersihan"), nd = rd("fKedisiplinan"), nb = rd("fBahasa");

  const validation = StandingsEngine.validateEntry({
    tanggal: t,
    sakan: s,
    kebersihan: nk,
    kedisiplinan: nd,
    bahasa: nb
  });

  if (!validation.ok) {
    showToast(`[${validation.code}] ${validation.message}`, true);
    return;
  }

  const btn = document.getElementById("btnSaveKlasemen");
  btn.disabled = true;

  // WhatsApp-style Optimistic local commit (0ms)
  await store.saveKlasemen(validation.value);
  btn.disabled = false;
  closeModal("modalKlasemen");
  renderKlasemen();
  showToast("Nilai tersimpan secara lokal. Sedang disinkronkan...");
}

/* ===== INPUT MASSAL HARIAN (1B VERSI A) ===== */
function openKlasemenBulkModal() {
  const filterT = document.getElementById("filterTanggal").value;
  document.getElementById("bulkTanggal").value = filterT || todayStr();
  const errNote = document.getElementById("bulkErrorNote");
  if (errNote) errNote.style.display = "none";
  populateBulkTable();
  document.getElementById("modalKlasemenBulk").classList.add("show");
}

function populateBulkTable() {
  const tbody = document.getElementById("bulkTableTbody");
  if (!tbody) return;
  const list = getActiveSakanList();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="center" style="padding:20px; color:var(--ink-faint);">Belum ada data master sakan.</td></tr>';
    return;
  }

  const selectedDate = document.getElementById("bulkTanggal").value || todayStr();
  const existingRecords = store.getKlasemen().filter(r => r.tanggal === selectedDate);
  const existingMap = new Map();
  existingRecords.forEach(r => existingMap.set(String(r.sakan || '').toUpperCase(), r));

  tbody.innerHTML = list.map((s, idx) => {
    const ex = existingMap.get(String(s.nama).toUpperCase());
    const valKeb = ex && ex.kebersihan != null ? ex.kebersihan : '';
    const valKed = ex && ex.kedisiplinan != null ? ex.kedisiplinan : '';
    const valBah = ex && ex.bahasa != null ? ex.bahasa : '';

    const validNums = [valKeb, valKed, valBah].filter(v => v !== '').map(Number);
    const avgText = validNums.length ? (validNums.reduce((a, b) => a + b, 0) / validNums.length).toFixed(1) : '–';

    const sakanEsc = escapeHtml(s.nama);
    const sub = s.gedung ? `<div style="font-size:11px; color:var(--ink-faint);">${escapeHtml(s.gedung)}</div>` : '';

    return `
      <tr data-sakan="${sakanEsc}">
        <td>
          <div style="font-weight:600; color:var(--ink);">${sakanEsc}</div>
          ${sub}
        </td>
        <td>
          <input type="text" inputmode="decimal" autocomplete="off" class="bulk-keb" placeholder="–" value="${valKeb}" oninput="onBulkInputChanged(this)">
        </td>
        <td>
          <input type="text" inputmode="decimal" autocomplete="off" class="bulk-ked" placeholder="–" value="${valKed}" oninput="onBulkInputChanged(this)">
        </td>
        <td>
          <input type="text" inputmode="decimal" autocomplete="off" class="bulk-bah" placeholder="–" value="${valBah}" oninput="onBulkInputChanged(this)">
        </td>
        <td class="center">
          <span class="bulk-row-avg">${avgText}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function onBulkInputChanged(input) {
  if (!input) return;
  let val = input.value.replace(/[^0-9.,]/g, '');
  const parts = val.split(/[.,]/);
  if (parts.length > 2) {
    val = parts[0] + '.' + parts.slice(1).join('');
  }
  input.value = val;
  const trimmed = val.trim();
  if (trimmed !== '' && trimmed !== '.' && trimmed !== ',') {
    const n = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 100) {
      input.classList.add('invalid');
    } else {
      input.classList.remove('invalid');
    }
  } else {
    input.classList.remove('invalid');
  }

  const tr = input.closest('tr');
  if (!tr) return;
  const keb = tr.querySelector('.bulk-keb').value.trim().replace(',', '.');
  const ked = tr.querySelector('.bulk-ked').value.trim().replace(',', '.');
  const bah = tr.querySelector('.bulk-bah').value.trim().replace(',', '.');
  const avgSpan = tr.querySelector('.bulk-row-avg');

  const validVals = [keb, ked, bah].filter(v => v !== '' && !isNaN(Number(v))).map(Number).filter(v => v >= 0 && v <= 100);
  if (validVals.length > 0) {
    avgSpan.textContent = (validVals.reduce((a, b) => a + b, 0) / validVals.length).toFixed(1);
  } else {
    avgSpan.textContent = '–';
  }
}

async function simpanKlasemenBulk() {
  const t = normalizeDateStr(document.getElementById("bulkTanggal").value);
  const errNote = document.getElementById("bulkErrorNote");
  if (!t) {
    if (errNote) {
      errNote.textContent = "Tanggal penilaian tidak valid.";
      errNote.style.display = "block";
    }
    return;
  }

  const rows = document.querySelectorAll("#bulkTableTbody tr");
  const entries = [];

  rows.forEach(tr => {
    const sakan = tr.getAttribute("data-sakan");
    const keb = tr.querySelector(".bulk-keb").value.trim().replace(',', '.');
    const ked = tr.querySelector(".bulk-ked").value.trim().replace(',', '.');
    const bah = tr.querySelector(".bulk-bah").value.trim().replace(',', '.');

    entries.push({
      tanggal: t,
      sakan,
      kebersihan: keb === "" ? null : keb,
      kedisiplinan: ked === "" ? null : ked,
      bahasa: bah === "" ? null : bah
    });
  });

  const validation = StandingsEngine.validateBulk(entries);
  if (!validation.ok) {
    if (errNote) {
      errNote.textContent = `[${validation.code}] ${validation.message}`;
      errNote.style.display = "block";
    }
    return;
  }

  if (errNote) errNote.style.display = "none";
  const btn = document.getElementById("btnSaveBulkKlasemen");
  btn.disabled = true;

  // WhatsApp-style Optimistic local bulk commit (0ms)
  await store.saveKlasemenBulk(validation.validEntries);

  btn.disabled = false;
  closeModal("modalKlasemenBulk");
  renderKlasemen();
  showToast(`${validation.validEntries.length} sakan tersimpan secara lokal. Sedang disinkronkan...`);
}

async function hapusKlasemen(t,s){
  if(!confirm("Hapus data poin ini?"))return;
  const res = await store.deleteKlasemen(t, s);
  if(res.status === "success"){
    renderKlasemen();
    showToast("Data berhasil dihapus.");
  } else {
    showToast(res.message || "Gagal menghapus data di server.", true);
  }
}

/* =========================================================================
   MODUL 2: TURNAMEN BOLA & SISTEM AKAR / BRACKET
   ========================================================================= */
let currentLigaTab = "jadwal";

function switchLigaTab(tab) {
  currentLigaTab = tab;
  const btnJadwal = document.getElementById("tabLigaJadwal");
  const btnHasil = document.getElementById("tabLigaHasil");
  const panelJadwal = document.getElementById("panelLigaJadwal");
  const panelHasil = document.getElementById("panelLigaHasil");
  if (btnJadwal && btnHasil && panelJadwal && panelHasil) {
    btnJadwal.classList.toggle("active", tab === "jadwal");
    btnHasil.classList.toggle("active", tab === "hasil");
    panelJadwal.classList.toggle("hidden", tab !== "jadwal");
    panelHasil.classList.toggle("hidden", tab !== "hasil");
  }
}

function renderligaMenu() {
  applyAccessNotes();

  // Pisahkan Jadwal vs Hasil & Bangun Bagan via TournamentEngine (In-Process)
  const { jadwalList, hasilList } = TournamentEngine.partitionMatches(store.getMatches());
  const bracket = TournamentEngine.buildBracket(store.getMatches());

  // 1. Render Panel Jadwal
  const jadwalContainer = document.getElementById("jadwalListContainer");
  const ce = canEditLiga();

  if (!jadwalList.length) {
    jadwalContainer.innerHTML = '<div style="text-align:center; padding:32px 10px; color:var(--ink-faint); font-size:13.5px;">Belum ada jadwal pertandingan bola yang akan datang.</div>';
  } else {
    jadwalContainer.innerHTML = jadwalList.map(m => {
      const st = eventStatus(m.tanggal);
      const isLive = m.status === "LIVE";
      return `
        <div class="jadwal-match-card">
          <div class="jadwal-match-header">
            <div class="jadwal-meta-left">
              <span class="jadwal-round-tag">${escapeHtml(formatTitleCase(m.round || "Pertandingan"))}</span>
              ${renderSyncBadge(m._syncStatus, m._syncId, m._syncError)}
              <div class="jadwal-meta-items">
                <span class="jadwal-meta-item">${svgIcon('calendar', 12)} <span>${formatTanggal(m.tanggal)}</span></span>
                ${m.waktu ? `<span class="jadwal-meta-item">${svgIcon('clock', 12)} <span>${escapeHtml(m.waktu)}</span></span>` : ''}
                ${m.lokasi ? `<span class="jadwal-meta-item">${svgIcon('map-pin', 12)} <span>${escapeHtml(m.lokasi)}</span></span>` : ''}
              </div>
            </div>
            <span class="jadwal-status-badge ${isLive ? 'live' : st.cls}">
              ${isLive ? '<span class="dash-live-dot"></span>Sedang Main' : st.label}
            </span>
          </div>
          <div class="jadwal-match-teams">
            <span class="jadwal-match-team-a">${escapeHtml(formatTitleCase(m.timA))}</span>
            <span class="jadwal-match-vs">vs</span>
            <span class="jadwal-match-team-b">${escapeHtml(formatTitleCase(m.timB))}</span>
          </div>
          ${ce ? `
            <div class="jadwal-match-actions">
              <button class="btn btn-ghost" onclick="openJadwalModal('${m.id}')">${svgIcon('settings', 14)} Ubah Info</button>
              <button class="btn btn-gold" onclick="openScoreInputModal('${m.id}')">${svgIcon('edit', 14)} Input Skor</button>
              <button class="icon-btn danger" title="Hapus" onclick="hapusMatch('${m.id}')">${svgIcon('trash', 14)}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join("");
  }

  // 2. Render Panel Hasil & Bagan Turnamen (Style C Vertikal)
  const bracketContainer = document.getElementById("bracketTreeContainer");
  bracketContainer.innerHTML = `
    <!-- BABAK PENYISIHAN (8 BESAR) -->
    <div class="bracket-round-col">
      <div class="bracket-col-title">Babak Penyisihan (8 Besar)</div>
      ${bracket.rounds.penyisihan.length === 0 ? '<div class="empty-row" style="font-size:12px; padding:20px; text-align:center;">Belum ada hasil penyisihan</div>' :
        bracket.rounds.penyisihan.map(m => renderBracketMatchBox(m, ce)).join('')}
    </div>

    <!-- BABAK SEMIFINAL (4 BESAR) -->
    <div class="bracket-round-col">
      <div class="bracket-col-title">Semifinal (4 Besar)</div>
      ${bracket.rounds.semifinal.length === 0 ? '<div class="empty-row" style="font-size:12px; padding:20px; text-align:center;">Menunggu Penyisihan Selesai</div>' :
        bracket.rounds.semifinal.map(m => renderBracketMatchBox(m, ce)).join('')}
    </div>

    <!-- BABAK FINAL & JUARA -->
    <div class="bracket-round-col">
      <div class="bracket-col-title">Grand Final &amp; Juara</div>
      ${bracket.rounds.final.length === 0 ? '<div class="empty-row" style="font-size:12px; padding:20px; text-align:center;">Menunggu Semifinal Selesai</div>' :
        bracket.rounds.final.map(m => renderBracketMatchBox(m, ce, true)).join('')}

      ${bracket.isDecided ? `
        <div class="champion-box" style="margin-top:14px;">
          <div class="champion-trophy-badge">
            ${svgIcon('trophy', 26)}
          </div>
          <div class="champion-title">Juara Utama Liga Bola</div>
          <div class="champion-name">${escapeHtml(formatTitleCase(bracket.champion))}</div>
        </div>
      ` : `
        <div class="champion-box-pending" style="margin-top:14px;">
          <div class="champion-pending-icon">
            ${svgIcon('trophy', 22)}
          </div>
          <div class="champion-pending-title">Juara Ditentukan di Grand Final</div>
          <div class="champion-pending-sub">Menunggu laga final selesai dimainkan</div>
        </div>
      `}
    </div>
  `;

  // 3. Render Rekap Riwayat Skor: Desktop Table & Mobile Cards
  const mt = document.getElementById("matchTbody");
  const mc = document.getElementById("matchCardsMobile");

  if (!hasilList.length) {
    if (mt) mt.innerHTML = '<tr class="empty-row"><td colspan="' + (ce ? 5 : 4) + '">Belum ada riwayat hasil pertandingan.</td></tr>';
    if (mc) mc.innerHTML = '<div style="text-align:center; padding:24px 10px; color:var(--ink-faint); font-size:13px; background:var(--parchment); border-radius:10px; border:1.5px dashed var(--line);">Belum ada riwayat hasil pertandingan.</div>';
  } else {
    if (mt) {
      mt.innerHTML = hasilList.map(m => `
        <tr>
          <td><span class="pill">${escapeHtml(formatTitleCase(m.round || "Penyisihan"))}</span></td>
          <td>${formatTanggal(m.tanggal)}</td>
          <td>${escapeHtml(formatTitleCase(m.timA))} vs ${escapeHtml(formatTitleCase(m.timB))} ${renderSyncBadge(m._syncStatus, m._syncId, m._syncError)}</td>
          <td class="center"><span class="pill total">${m.skorA} - ${m.skorB}</span></td>
          ${ce ? '<td class="center"><div class="row-actions"><button class="icon-btn" title="Koreksi Skor" onclick="openScoreInputModal(\'' + m.id + '\')">' + svgIcon('edit', 14) + '</button><button class="icon-btn danger" title="Hapus" onclick="hapusMatch(\'' + m.id + '\')">' + svgIcon('trash', 14) + '</button></div></td>' : ''}
        </tr>
      `).join("");
    }
    if (mc) {
      mc.innerHTML = hasilList.map(m => {
        const sa = Number(m.skorA);
        const sb = Number(m.skorB);
        const isAWin = sa > sb;
        const isBWin = sb > sa;
        return `
          <div class="rekap-match-card">
            <div class="rekap-card-head">
              <span class="pill">${escapeHtml(formatTitleCase(m.round || "Penyisihan"))}</span>
              ${renderSyncBadge(m._syncStatus, m._syncId, m._syncError)}
              <span class="rekap-card-date">${svgIcon('calendar', 12)} <span>${formatTanggal(m.tanggal)}</span></span>
            </div>
            <div class="rekap-card-teams">
              <div class="rekap-card-team ${isAWin ? 'winner' : (isBWin ? 'loser' : '')}">
                <span class="rekap-team-label">
                  ${isAWin ? `<span class="winner-trophy-icon">${svgIcon('trophy', 13)}</span>` : ''}
                  <span>${escapeHtml(formatTitleCase(m.timA))}</span>
                </span>
                <span class="rekap-team-score ${isBWin ? 'loser' : ''}">${m.skorA}</span>
              </div>
              <div class="rekap-card-team ${isBWin ? 'winner' : (isAWin ? 'loser' : '')}">
                <span class="rekap-team-label">
                  ${isBWin ? `<span class="winner-trophy-icon">${svgIcon('trophy', 13)}</span>` : ''}
                  <span>${escapeHtml(formatTitleCase(m.timB))}</span>
                </span>
                <span class="rekap-team-score ${isAWin ? 'loser' : ''}">${m.skorB}</span>
              </div>
            </div>
            ${ce ? `
              <div class="rekap-card-actions">
                <button class="btn btn-ghost" onclick="openScoreInputModal('${m.id}')">${svgIcon('edit', 13)} Koreksi Skor</button>
                <button class="icon-btn danger" title="Hapus" onclick="hapusMatch('${m.id}')">${svgIcon('trash', 13)}</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join("");
    }
  }
}

function renderBracketMatchBox(m, ce, isFinal = false) {
  const sa = Number(m.skorA);
  const sb = Number(m.skorB);
  const isAWin = sa > sb;
  const isBWin = sb > sa;
  return `
    <div class="bracket-match-box" style="${isFinal ? 'border-color:var(--gold);' : ''}">
      <div class="bracket-team ${isAWin ? 'winner' : (isBWin ? 'loser' : '')}">
        <span class="bracket-team-name">
          ${isFinal && isAWin ? `<span class="winner-trophy-icon" title="Juara">${svgIcon('trophy', 14)}</span>` : ''}
          <span>${escapeHtml(formatTitleCase(m.timA))}</span>
        </span>
        <span class="bracket-score ${isBWin ? 'loser' : ''}">${m.skorA}</span>
      </div>
      <div class="bracket-team ${isBWin ? 'winner' : (isAWin ? 'loser' : '')}">
        <span class="bracket-team-name">
          ${isFinal && isBWin ? `<span class="winner-trophy-icon" title="Juara">${svgIcon('trophy', 14)}</span>` : ''}
          <span>${escapeHtml(formatTitleCase(m.timB))}</span>
        </span>
        <span class="bracket-score ${isAWin ? 'loser' : ''}">${m.skorB}</span>
      </div>
      <div class="bracket-meta">
        <span class="bracket-meta-item">${svgIcon('calendar', 11)} ${formatTanggal(m.tanggal)}</span>
        ${m.lokasi ? `<span class="bracket-meta-item">${svgIcon('map-pin', 11)} ${escapeHtml(m.lokasi)}</span>` : ''}
        ${renderSyncBadge(m._syncStatus, m._syncId, m._syncError)}
      </div>
      ${ce ? `
        <div class="bracket-actions">
          <button class="icon-btn" title="Koreksi Skor" onclick="openScoreInputModal('${m.id}')">${svgIcon('edit', 14)}</button>
          <button class="icon-btn danger" title="Hapus" onclick="hapusMatch('${m.id}')">${svgIcon('trash', 14)}</button>
        </div>
      ` : ''}
    </div>
  `;
}

function openJadwalModal(matchId = null) {
  fillTeamSelects();
  const title = document.getElementById("modalLigaTitle");
  const mode = document.getElementById("mMode");
  const idInput = document.getElementById("mMatchId");
  const skorSec = document.getElementById("mSkorSection");

  mode.value = "jadwal";
  skorSec.style.display = "none";

  if (matchId) {
    const m = dataLiga.find(i => String(i.id) === String(matchId));
    if (!m) return;
    title.textContent = "Ubah Jadwal Pertandingan";
    idInput.value = m.id;
    document.getElementById("mRound").value = m.round || "Penyisihan";
    document.getElementById("mTanggal").value = m.tanggal || todayStr();
    document.getElementById("mWaktu").value = m.waktu || "";
    document.getElementById("mLokasi").value = m.lokasi || "Lapangan Utama";
    document.getElementById("mTimA").value = m.timA || "";
    document.getElementById("mTimB").value = m.timB || "";
  } else {
    title.textContent = "Jadwalkan Pertandingan Baru";
    idInput.value = "";
    document.getElementById("mRound").value = "Penyisihan";
    document.getElementById("mTanggal").value = todayStr();
    document.getElementById("mWaktu").value = "15:30 WIB";
    document.getElementById("mLokasi").value = "Lapangan Utama";
    document.getElementById("mTimA").value = "";
    document.getElementById("mTimB").value = "";
  }
  document.getElementById("modalLiga").classList.add("show");
}

function openScoreInputModal(matchId) {
  fillTeamSelects();
  const title = document.getElementById("modalLigaTitle");
  const mode = document.getElementById("mMode");
  const idInput = document.getElementById("mMatchId");
  const skorSec = document.getElementById("mSkorSection");

  const m = dataLiga.find(i => String(i.id) === String(matchId));
  if (!m) return;

  mode.value = "skor";
  title.textContent = "Input Skor: " + m.timA + " vs " + m.timB;
  idInput.value = m.id;
  document.getElementById("mRound").value = m.round || "Penyisihan";
  document.getElementById("mTanggal").value = m.tanggal || todayStr();
  document.getElementById("mWaktu").value = m.waktu || "";
  document.getElementById("mLokasi").value = m.lokasi || "Lapangan Utama";
  document.getElementById("mTimA").value = m.timA;
  document.getElementById("mTimB").value = m.timB;

  skorSec.style.display = "block";
  document.getElementById("labelSkorA").textContent = "Skor " + m.timA;
  document.getElementById("labelSkorB").textContent = "Skor " + m.timB;
  document.getElementById("mSkorA").value = (m.skorA !== "" && m.skorA != null) ? m.skorA : "0";
  document.getElementById("mSkorB").value = (m.skorB !== "" && m.skorB != null) ? m.skorB : "0";

  document.getElementById("modalLiga").classList.add("show");
}

function openMatchModal() {
  openJadwalModal();
}

async function simpanMatch() {
  const mode = document.getElementById("mMode").value;
  const matchId = document.getElementById("mMatchId").value;
  const round = document.getElementById("mRound").value;
  const rawT = document.getElementById("mTanggal").value;
  const waktu = document.getElementById("mWaktu").value.trim();
  const lokasi = document.getElementById("mLokasi").value.trim() || "Lapangan Utama";
  const a = document.getElementById("mTimA").value;
  const b = document.getElementById("mTimB").value;

  const t = normalizeDateStr(rawT);
  if (!t) { showToast("Format tanggal tidak valid (YYYY-MM-DD).", true); return; }

  const existing = matchId ? store.getMatches().find(m => String(m.id) === String(matchId)) : null;
  let sa = "";
  let sb = "";
  let status = "UPCOMING";

  if (mode === "skor") {
    const rawA = document.getElementById("mSkorA").value;
    const rawB = document.getElementById("mSkorB").value;
    const validation = TournamentEngine.validateScore({ timA: a, timB: b }, rawA, rawB);
    if (!validation.ok) {
      showToast(validation.error, true);
      return;
    }
    sa = validation.value.skorA;
    sb = validation.value.skorB;
    status = "SELESAI";
  } else {
    const validation = TournamentEngine.validateSchedule({ timA: a, timB: b, tanggal: t });
    if (!validation.ok) {
      showToast(validation.error, true);
      return;
    }
    if (existing) {
      sa = (existing.skorA !== undefined && existing.skorA !== null) ? existing.skorA : "";
      sb = (existing.skorB !== undefined && existing.skorB !== null) ? existing.skorB : "";
      status = existing.status || (sa !== "" && sb !== "" ? "SELESAI" : "UPCOMING");
    }
  }

  const btn = document.getElementById("btnSaveLiga");
  btn.disabled = true;
  btn.innerHTML = `${svgIcon('loader', 14, 'svg-spinner')} Menyimpan...`;

  const targetId = matchId || Date.now().toString();
  const matchObj = {
    id: targetId,
    round: round,
    tanggal: t,
    waktu: waktu,
    lokasi: lokasi,
    timA: a,
    timB: b,
    skorA: sa,
    skorB: sb,
    status: status
  };

  btn.disabled = false;
  btn.textContent = "Simpan";
  closeModal("modalLiga");

  // WhatsApp-style Optimistic local commit (0ms)
  await store.saveMatch(matchObj);
  renderligaMenu();
  if (mode === "skor") {
    switchLigaTab("hasil");
  }
  showToast(mode === "skor" ? "Skor tersimpan secara lokal. Sedang disinkronkan..." : "Jadwal tersimpan secara lokal. Sedang disinkronkan...");
}

async function hapusMatch(id) {
  if (!confirm("Hapus data pertandingan ini?")) return;
  const res = await store.deleteMatch(id);
  if (res.status === "success") {
    renderligaMenu();
    showToast("Pertandingan berhasil dihapus.");
  } else {
    showToast(res.message || "Gagal menghapus di server.", true);
  }
}

/* =========================================================================
   MODUL 3: EVENT & JADWAL BOLA LENGKAP DENGAN GAMBAR
   ========================================================================= */
function eventStatus(t){const today=todayStr();if(t===today)return{cls:"today",label:"Hari Ini"};return t>today?{cls:"upcoming",label:"Akan Datang"}:{cls:"past",label:"Selesai"};}

function renderEvent(){
  applyAccessNotes();
  const list=[...dataEvent].sort((a,b)=>(String(a.tanggal||'')+String(a.waktu||'')).localeCompare(String(b.tanggal||'')+String(b.waktu||'')));
  const el=document.getElementById("eventList");
  const ce=canEditEvent();
  if(!list.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--ink-faint);">Belum ada agenda atau kegiatan pesantren.</div>';return;}
  const months=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  el.innerHTML=list.map((e)=>{
    let dNum = "–", dMonth = "–";
    let strDate = String(e.tanggal || "").trim();
    if(strDate.includes("T")) strDate = strDate.split("T")[0];
    const parts = strDate.split("-");
    if(parts.length === 3){
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if(!isNaN(dateObj.getTime())){
        dNum = dateObj.toLocaleDateString("id-ID", { day: "numeric" });
        dMonth = dateObj.toLocaleDateString("id-ID", { month: "short" });
      }
    }

    const st=eventStatus(e.tanggal);
    const badgeColor = "background:var(--parchment-dim);color:var(--ink-soft);";
    const katLabel = e.kategori || "Event Umum";
    const safeFoto = sanitizeImageUrl(e.foto);
    const photoTag = safeFoto ? `<img src="${safeFoto}" class="event-thumb-img js-lightbox-trigger" alt="Poster Kegiatan" title="Klik untuk perbesar" data-src="${safeFoto}">` : '';

    return `
      <div class="event-card">
        <div class="event-date-box">
          <div class="event-date-num">${dNum}</div>
          <div class="event-date-month">${dMonth}</div>
        </div>
        <div style="flex:1;">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px; flex-wrap:wrap;">
            <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; ${badgeColor}">${escapeHtml(katLabel)}</span>
            <span style="font-size:12px;color:var(--ink-faint);">${svgIcon('clock', 12)} ${formatWaktu(e.waktu)} • ${svgIcon('map-pin', 12)} ${escapeHtml(e.lokasi||"–")}</span>
          </div>
          <strong style="font-size:15px; color:var(--ink);">${escapeHtml(e.judul)} ${renderSyncBadge(e._syncStatus, e._syncId, e._syncError)}</strong>
          ${e.deskripsi?'<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">'+escapeHtml(e.deskripsi)+'</div>':''}
        </div>
        ${photoTag}
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:${st.cls==="today"?"var(--gold-deep)":st.cls==="upcoming"?"var(--green-subtle)":"var(--parchment-dim)"};color:${st.cls==="today"?"#fff":st.cls==="upcoming"?"var(--green-ok)":"var(--ink-faint)"};border:1px solid ${st.cls==="upcoming"?"var(--green-border)":"transparent"};">${st.label}</span>
        ${ce?'<button class="icon-btn danger" title="Hapus Event" onclick="hapusEvent(\''+e.id+'\')">'+svgIcon('trash', 14)+'</button>':''}
      </div>
    `;
  }).join("");
}

function handleImagePreview(e){
  const file = e.target.files[0];
  if(!file){ clearImageUpload(); return; }

  const reader = new FileReader();
  reader.onload = function(evt){
    const img = new Image();
    img.onload = function(){
      // Kompresi otomatis via Canvas (Max dimensi 1000px, quality 0.75)
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const maxDim = 1000;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Hasil kompresi ringan (~100KB - 250KB)
      tempBase64Image = canvas.toDataURL("image/jpeg", 0.75);
      document.getElementById("imgPreview").src = tempBase64Image;
      document.getElementById("imgPreviewWrapper").style.display = "block";
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}
function clearImageUpload(){
  tempBase64Image = "";
  document.getElementById("eFotoFile").value = "";
  document.getElementById("imgPreview").src = "";
  document.getElementById("imgPreviewWrapper").style.display = "none";
}

function openLightbox(src) {
  const safe = sanitizeImageUrl(src);
  if (!safe) return;
  document.getElementById('lightboxImg').src = safe;
  document.getElementById('imageLightbox').style.display = 'flex';
}

document.addEventListener('click', (ev) => {
  const trigger = ev.target.closest('.js-lightbox-trigger');
  if (trigger && trigger.dataset.src) {
    openLightbox(trigger.dataset.src);
  }
});

function closeLightbox() {
  document.getElementById('imageLightbox').style.display = 'none';
}

function openEventModal(){
  document.getElementById("eKategori").value="Event Umum";
  document.getElementById("eTanggal").value=todayStr();
  document.getElementById("eWaktu").value="";
  document.getElementById("eJudul").value="";
  document.getElementById("eLokasi").value="";
  document.getElementById("eDeskripsi").value="";
  clearImageUpload();
  document.getElementById("modalEvent").classList.add("show");
}

async function simpanEvent(){
  const kat=document.getElementById("eKategori").value;
  const rawT=document.getElementById("eTanggal").value, w=document.getElementById("eWaktu").value;
  const t=normalizeDateStr(rawT);
  if(!t){showToast("Format tanggal tidak valid (YYYY-MM-DD).",true);return;}
  const j=document.getElementById("eJudul").value.trim(), l=document.getElementById("eLokasi").value.trim(), d=document.getElementById("eDeskripsi").value.trim();
  if(!j){showToast("Judul kegiatan wajib diisi.",true);return;}
  
  const newId = Date.now().toString();
  const payload = {
    id: newId,
    kategori: kat,
    tanggal: t,
    waktu: w,
    judul: j,
    lokasi: l,
    deskripsi: d,
    foto: tempBase64Image || "",
    fotoBase64: tempBase64Image || ""
  };

  const btn = document.getElementById("btnSaveEvent");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Simpan";
  }
  closeModal("modalEvent");
  clearImageUpload();

  // WhatsApp-style Optimistic local commit (0ms)
  await store.saveEvent(payload);
  renderEvent();
  showToast("Agenda event tersimpan secara lokal. Sedang disinkronkan...");
}

async function hapusEvent(id){
  if(!confirm("Hapus agenda/event ini?"))return;
  const res = await store.deleteEvent(id);
  if(res.status === "success"){
    renderEvent();
    showToast("Event berhasil dihapus.");
  } else {
    showToast(res.message || "Gagal menghapus event di server.", true);
  }
}

/* =========================================================================
   INISIALISASI APLIKASI
   ========================================================================= */
document.getElementById("passwordInput").addEventListener("keypress",e=>{if(e.key==="Enter")login();});
document.getElementById("usernameInput").addEventListener("keypress",e=>{if(e.key==="Enter")document.getElementById("passwordInput").focus();});

(async function init(){
  // 1. Cek session login admin
  const session = loadSession();
  const hasAdminSession = session && session.user && session.role && session.role !== "tamu";
  const token = hasAdminSession ? (session.token || "") : "";

  if (hasAdminSession) {
    currentUser = session.user;
    currentRole = session.role;
    currentLabel = session.label || "Admin";
    currentAuthToken = token;
    currentView = session.view || "homepage";
  } else {
    currentUser = "Tamu";
    currentRole = "tamu";
    currentLabel = "Tamu";
    currentAuthToken = "";
    currentView = "homepage";
  }

  // 2. Inisialisasi DataStore (muat dari localStorage & set auth token)
  store.init(currentAuthToken);
  fillSakanSelect();
  fillTeamSelects();
  renderSakanPills();

  // Terapkan UI sesi (admin vs publik)
  applyUserSessionUI();

  const hash = window.location.hash.replace("#", "");
  const [viewPart, subPart] = hash.split("/");
  const initialView = ["klasemen", "liga", "event"].includes(viewPart) ? viewPart : currentView;
  history.replaceState({ view: initialView }, "", initialView === "homepage" ? window.location.pathname : "#" + hash);
  switchView(initialView, false);

  if (viewPart === "liga" && subPart === "hasil") {
    switchLigaTab("hasil");
  } else if (hash === "login") {
    openLoginModal();
  } else if (hash === "modal-klasemen") {
    if (canEditKlasemenAny()) openKlasemenModal();
  } else if (hash === "modal-bulk") {
    if (canEditKlasemenAny()) openBulkInputModal();
  } else if (hash === "modal-liga") {
    if (canEditLiga()) openMatchModal();
  } else if (hash === "modal-event") {
    if (canEditEvent()) openEventModal();
  }

  // 3. Sinkronkan dengan Cloud via Proxy Vercel
  await syncDataFromCloud();
})();
