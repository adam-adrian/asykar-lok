/**
 * =========================================================================
 * BACKEND API GOOGLE APPS SCRIPT - LEAGUE OF KINDNESS (VERCEL PROXY READY)
 * =========================================================================
 * 
 * STRUKTUR SPREADSHEET (6 Tab):
 * 1. Tab "Users"    : username | password | role | label | status
 * 2. Tab "Klasemen" : id | tanggal | sakan | kebersihan | kedisiplinan | bahasa | totalPoin
 * 3. Tab "Liga"     : id | round | tanggal | timA | timB | skorA | skorB  (timA/timB = Gedung)
 * 4. Tab "Event"    : id | kategori | tanggal | waktu | judul | lokasi | deskripsi | foto
 * 5. Tab "Gedung"   : id | nama | urutan | aktif  (sumber pilihan Tim Liga)
 * 6. Tab "Sakan"    : id | nama | gedung | urutan | aktif  (sumber pilihan Klasemen)
 * 
 * 💡 TIPS PENGURUS:
 * - Tab "Users": Tambah/ubah akun admin tanpa perlu mengubah kode.
 * - Tab "Gedung": Tambah nama gedung untuk tim turnamen liga.
 * - Tab "Sakan": Tambah nama sakan dan tentukan masuk di gedung mana.
 */

// 💡 FOLDER_ID diambil secara aman dari Script Properties (Environment Variables Google Apps Script)
// Cara setting: Buka Project Settings (⚙️) > Script Properties > Tambah: FOLDER_ID = [ID Folder Anda]
function getFolderId() {
  return PropertiesService.getScriptProperties().getProperty("FOLDER_ID") || "";
}
function getDb() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Helper: Bungkus respons JSON Apps Script.
 */
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// SESI & OTORISASI SERVER-SIDE
// =========================================================================
// Token sesi disimpan di ScriptCache. Batas CacheService adalah 6 jam,
// jadi pengguna login ulang paling lama sehari sekali.
//
// ACTION_ROLES mencerminkan gate di index.html:
//   "*"  -> setiap sesi non-tamu (cermin dari canEditKlasemenAny())
//   [..] -> hanya peran yang disebut
// Aksi yang tidak terdaftar di sini DITOLAK, bukan diabaikan.
const SESSION_TTL_SECONDS = 21600;
const ACTION_ROLES = {
  save_klasemen:      "*",
  save_klasemen_bulk: "*",
  delete_klasemen:    ["admin_utama"],
  save_match:         ["admin_utama"],
  delete_match:       ["admin_utama"],
  save_event:         ["admin_utama"],
  delete_event:       ["admin_utama"]
};

function issueSession(user) {
  const token = "tok_" + Utilities.getUuid();
  CacheService.getScriptCache().put(
    "sess_" + token,
    JSON.stringify({ username: user.username, role: user.role }),
    SESSION_TTL_SECONDS
  );
  return token;
}

function getSession(token) {
  const key = String(token || "").trim();
  if (!key) return null;
  const raw = CacheService.getScriptCache().get("sess_" + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

/**
 * Mengembalikan null jika aksi boleh dijalankan, atau objek respons error
 * jika ditolak. Apps Script tidak dapat membaca header HTTP, sehingga token
 * dibaca dari body — proxy Vercel yang memindahkannya dari header Authorization.
 */
function denyIfUnauthorized(action, token) {
  const allowed = ACTION_ROLES[action];
  if (!allowed) {
    return { status: "error", code: "ERR_UNKNOWN_ACTION", message: "Aksi tidak dikenal: " + String(action) };
  }

  const session = getSession(token);
  if (!session) {
    return {
      status: "error",
      code: "ERR_UNAUTHORIZED",
      message: "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali."
    };
  }

  const role = String(session.role || "").toLowerCase();
  const ok = allowed === "*"
    ? role !== "" && role !== "tamu"
    : allowed.indexOf(role) > -1;

  if (!ok) {
    return {
      status: "error",
      code: "ERR_FORBIDDEN",
      message: "Peran Anda tidak berhak melakukan aksi ini."
    };
  }
  return null;
}

/**
 * 1. GET: Mengambil data PUBLIK saja (Klasemen, Liga, Event, Gedung, Sakan).
 * CATATAN KEAMANAN: Data akun di Tab "Users" TIDAK PERNAH dikirim via GET!
 */
function doGet(e) {
  try {
    const ss = getDb();
    let sheetGedung = ss.getSheetByName("Gedung");
    if (!sheetGedung) {
      sheetGedung = ss.insertSheet("Gedung");
      sheetGedung.appendRow(["id", "nama", "urutan", "aktif"]);
      sheetGedung.appendRow(["qazvin", "QAZVIN", 1, true]);
    }

    let sheetSakan = ss.getSheetByName("Sakan");
    if (!sheetSakan) {
      sheetSakan = ss.insertSheet("Sakan");
      sheetSakan.appendRow(["id", "nama", "gedung", "urutan", "aktif"]);
      sheetSakan.appendRow(["qazvin-atas", "QAZVIN ATAS", "QAZVIN", 1, true]);
    }

    // Master data di-heal via onEdit saat pengurus mengedit spreadsheet,
    // tidak dijalankan pada doGet publik agar read latency cepat dan bebas write-lock.

    const result = {
      klasemen: sheetToObjects(ss.getSheetByName("Klasemen")),
      liga: sheetToObjects(ss.getSheetByName("Liga")),
      event: sheetToObjects(ss.getSheetByName("Event")),
      gedung: sheetToObjects(sheetGedung),
      sakan: sheetToObjects(sheetSakan)
    };
    
    return jsonOut({ status: "success", data: result });
  } catch (err) {
    return jsonOut({ status: "error", message: err.toString() });
  }
}

/**
 * 2. POST: Autentikasi Login & Mutasi Data (Simpan / Update / Hapus)
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    const payload = postData.payload;
    const ss = getDb();

    // Setiap aksi selain login WAJIB membawa token sesi yang sah.
    if (action !== "login") {
      const denial = denyIfUnauthorized(action, postData.token);
      if (denial) return jsonOut(denial);
    }
    
    // ==========================================
    // A. AUTENTIKASI LOGIN (Cek Tab "Users")
    // ==========================================
    if (action === "login") {
      let sheetUsers = ss.getSheetByName("Users");
      
      // Buat tab Users otomatis jika belum ada (tanpa hardcoded password)
      if (!sheetUsers) {
        sheetUsers = ss.insertSheet("Users");
        sheetUsers.appendRow(["username", "password", "role", "label", "status"]);
      }

      const users = sheetToObjects(sheetUsers);
      const inputUser = String(payload.username || "").trim().toLowerCase();
      const inputPass = String(payload.password || "").trim();

      const matched = users.find(u => 
        String(u.username).trim().toLowerCase() === inputUser && 
        String(u.password).trim() === inputPass
      );

      if (matched) {
        if (matched.status && String(matched.status).toLowerCase() === "inactive") {
          return jsonOut({ status: "error", message: "Akun ini telah dinonaktifkan." });
        }

        const sessionUser = {
          username: matched.username,
          role: matched.role || "admin_utama",
          label: matched.label || "Admin"
        };

        return jsonOut({
          status: "success",
          user: sessionUser,
          token: issueSession(sessionUser)
        });
      } else {
        return jsonOut({ status: "error", message: "Username atau password salah." });
      }
    }

    // ==========================================
    // MUTASI DATA DENGAN LOCK SERVICE
    // ==========================================
    // Mencegah race condition ketika beberapa admin menyimpan data di saat yang sama
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(10000); // Tunggu antrean sampai 10 detik
    if (!hasLock) {
      return jsonOut({ status: "error", message: "Server sedang sibuk memproses antrean data. Silakan coba lagi." });
    }

    try {
      function isScoreValid(val) {
        if (val === null || val === undefined || val === "") return true;
        const n = Number(val);
        return !isNaN(n) && n >= 0 && n <= 100;
      }

      // ==========================================
      // B. MODUL KLASEMEN
      // ==========================================
      if (action === "save_klasemen") {
        if (!isScoreValid(payload.kebersihan) || !isScoreValid(payload.kedisiplinan) || !isScoreValid(payload.bahasa)) {
          return jsonOut({
            status: "error",
            code: "ERR_OUT_OF_RANGE",
            message: "Nilai poin harus berupa angka di antara 0 sampai 100."
          });
        }

        let sheet = ss.getSheetByName("Klasemen");
        if (!sheet) {
          sheet = ss.insertSheet("Klasemen");
          sheet.appendRow(["id", "tanggal", "sakan", "kebersihan", "kedisiplinan", "bahasa", "totalPoin"]);
        }
        const rows = sheet.getDataRange().getValues();
        let rowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
          const rowDate = formatDateStr(rows[i][1], ss);
          if (rowDate === payload.tanggal && String(rows[i][2]).toUpperCase() === String(payload.sakan).toUpperCase()) {
            rowIndex = i + 1;
            break;
          }
        }
        
        const totalPoin = (Number(payload.kebersihan) || 0) + (Number(payload.kedisiplinan) || 0) + (Number(payload.bahasa) || 0);
        
        if (rowIndex > 0) {
          // Batch write 1x call untuk performa tinggi
          sheet.getRange(rowIndex, 4, 1, 4).setValues([[
            payload.kebersihan != null ? payload.kebersihan : "",
            payload.kedisiplinan != null ? payload.kedisiplinan : "",
            payload.bahasa != null ? payload.bahasa : "",
            totalPoin
          ]]);
        } else {
          sheet.appendRow([
            Date.now().toString(),
            payload.tanggal,
            payload.sakan,
            payload.kebersihan != null ? payload.kebersihan : "",
            payload.kedisiplinan != null ? payload.kedisiplinan : "",
            payload.bahasa != null ? payload.bahasa : "",
            totalPoin
          ]);
        }
      }
      else if (action === "save_klasemen_bulk") {
        let sheet = ss.getSheetByName("Klasemen");
        if (!sheet) {
          sheet = ss.insertSheet("Klasemen");
          sheet.appendRow(["id", "tanggal", "sakan", "kebersihan", "kedisiplinan", "bahasa", "totalPoin"]);
        }
        const entries = Array.isArray(payload) ? payload : (payload.entries || []);
        if (!entries.length) {
          return jsonOut({ status: "error", code: "ERR_EMPTY_DATA", message: "Tidak ada data entri yang dikirim." });
        }

        // Validasi batasan maksimal poin 0 - 100
        for (let k = 0; k < entries.length; k++) {
          const eItem = entries[k];
          if (!isScoreValid(eItem.kebersihan) || !isScoreValid(eItem.kedisiplinan) || !isScoreValid(eItem.bahasa)) {
            return jsonOut({
              status: "error",
              code: "ERR_OUT_OF_RANGE",
              message: "Nilai poin untuk " + (eItem.sakan || "sakan") + " harus berada di antara 0 sampai 100."
            });
          }
        }

        const rows = sheet.getDataRange().getValues();
        const rowMap = {};
        for (let i = 1; i < rows.length; i++) {
          const rDate = formatDateStr(rows[i][1], ss);
          const rSakan = String(rows[i][2] || "").trim().toUpperCase();
          rowMap[rDate + "_" + rSakan] = i + 1;
        }

        for (let k = 0; k < entries.length; k++) {
          const item = entries[k];
          const t = item.tanggal;
          const s = item.sakan;
          const totalPoin = (Number(item.kebersihan) || 0) + (Number(item.kedisiplinan) || 0) + (Number(item.bahasa) || 0);
          const lookupKey = t + "_" + String(s || "").trim().toUpperCase();
          const targetRow = rowMap[lookupKey];

          if (targetRow) {
            sheet.getRange(targetRow, 4, 1, 4).setValues([[
              item.kebersihan != null ? item.kebersihan : "",
              item.kedisiplinan != null ? item.kedisiplinan : "",
              item.bahasa != null ? item.bahasa : "",
              totalPoin
            ]]);
          } else {
            sheet.appendRow([
              Date.now().toString() + "_" + k,
              t,
              s,
              item.kebersihan != null ? item.kebersihan : "",
              item.kedisiplinan != null ? item.kedisiplinan : "",
              item.bahasa != null ? item.bahasa : "",
              totalPoin
            ]);
            rowMap[lookupKey] = sheet.getLastRow();
          }
        }
      }
      else if (action === "delete_klasemen") {
        const sheet = ss.getSheetByName("Klasemen");
        if (sheet) {
          const rows = sheet.getDataRange().getValues();
          for (let i = 1; i < rows.length; i++) {
            const rowDate = formatDateStr(rows[i][1], ss);
            if (rowDate === payload.tanggal && String(rows[i][2]).toUpperCase() === String(payload.sakan).toUpperCase()) {
              sheet.deleteRow(i + 1);
              break;
            }
          }
        }
      }
      // ==========================================
      // C. MODUL LIGA / MATCH BOLA
      // ==========================================
      else if (action === "save_match") {
        // Validasi skor jika kedua skor diisi
        if (payload.skorA !== "" && payload.skorA != null && payload.skorB !== "" && payload.skorB != null) {
          const sa = Number(payload.skorA);
          const sb = Number(payload.skorB);
          if (isNaN(sa) || isNaN(sb) || sa < 0 || sb < 0 || sa > 999 || sb > 999) {
            return jsonOut({
              status: "error",
              code: "ERR_OUT_OF_RANGE",
              message: "Skor harus berupa angka bilangan bulat antara 0 sampai 999."
            });
          }
          if (sa === sb) {
            return jsonOut({
              status: "error",
              code: "ERR_ANTI_DRAW",
              message: "Sistem gugur tidak boleh seri. Harus ada pemenang."
            });
          }
        }

        let sheet = ss.getSheetByName("Liga");
        if (!sheet) {
          sheet = ss.insertSheet("Liga");
          sheet.appendRow(["id", "round", "tanggal", "waktu", "lokasi", "timA", "timB", "skorA", "skorB", "status"]);
        } else {
          // Cek jika header lama (hanya 7 kolom)
          const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
          if (header.length < 10 && header[3] === "timA") {
            // Migrasi header jika belum ada waktu, lokasi, status
            sheet.getRange(1, 1, 1, 10).setValues([["id", "round", "tanggal", "waktu", "lokasi", "timA", "timB", "skorA", "skorB", "status"]]);
          }
        }

        const rows = sheet.getDataRange().getValues();
        let rowIndex = -1;
        if (payload.id) {
          for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === String(payload.id).trim()) {
              rowIndex = i + 1;
              break;
            }
          }
        }

        const matchStatus = payload.status || (payload.skorA !== "" && payload.skorA != null && payload.skorB !== "" && payload.skorB != null ? "SELESAI" : "UPCOMING");

        if (rowIndex > -1) {
          // Batch write 1x call untuk 9 kolom sekaligus
          sheet.getRange(rowIndex, 2, 1, 9).setValues([[
            payload.round || "",
            payload.tanggal || "",
            payload.waktu || "",
            payload.lokasi || "",
            payload.timA || "",
            payload.timB || "",
            payload.skorA != null ? payload.skorA : "",
            payload.skorB != null ? payload.skorB : "",
            matchStatus
          ]]);
        } else {
          sheet.appendRow([
            payload.id || Date.now().toString(),
            payload.round || "",
            payload.tanggal || "",
            payload.waktu || "",
            payload.lokasi || "",
            payload.timA || "",
            payload.timB || "",
            payload.skorA != null ? payload.skorA : "",
            payload.skorB != null ? payload.skorB : "",
            matchStatus
          ]);
        }
      }
      else if (action === "delete_match") {
        deleteRowById(ss.getSheetByName("Liga"), payload.id);
      }
      // ==========================================
      // D. MODUL EVENT & FOTO KEGIATAN
      // ==========================================
      else if (action === "save_event") {
        let sheet = ss.getSheetByName("Event");
        if (!sheet) {
          sheet = ss.insertSheet("Event");
          sheet.appendRow(["id", "kategori", "tanggal", "waktu", "judul", "lokasi", "deskripsi", "foto"]);
        }

        const rows = sheet.getDataRange().getValues();
        let rowIndex = -1;
        let existingFoto = "";
        if (payload.id) {
          for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === String(payload.id).trim()) {
              rowIndex = i + 1;
              existingFoto = rows[i][7] || "";
              break;
            }
          }
        }

        let fotoUrl = "";
        const folderId = getFolderId();
        if (payload.fotoBase64) {
          fotoUrl = uploadImageToDrive(payload.fotoBase64, "event_" + Date.now() + ".jpg", folderId);
        } else if (payload.foto) {
          fotoUrl = payload.foto;
        } else if (payload.foto === "" || payload.foto === null) {
          fotoUrl = "";
        } else if (rowIndex > -1) {
          fotoUrl = existingFoto;
        }
        if (rowIndex > -1) {
          // Batch write update event yang sudah ada
          sheet.getRange(rowIndex, 2, 1, 7).setValues([[
            payload.kategori || "Event Umum",
            payload.tanggal || "",
            payload.waktu || "",
            payload.judul || "",
            payload.lokasi || "",
            payload.deskripsi || "",
            fotoUrl
          ]]);
        } else {
          // Tambah event baru
          sheet.appendRow([
            payload.id || Date.now().toString(),
            payload.kategori || "Event Umum",
            payload.tanggal || "",
            payload.waktu || "",
            payload.judul || "",
            payload.lokasi || "",
            payload.deskripsi || "",
            fotoUrl
          ]);
        }
        return jsonOut({ status: "success", foto: fotoUrl });
      }
      else if (action === "delete_event") {
        deleteRowById(ss.getSheetByName("Event"), payload.id);
      }

      return jsonOut({ status: "success" });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOut({ status: "error", message: err.toString() });
  }
}

/**
 * Helper: Ambil TimeZone Spreadsheet (default Asia/Jakarta)
 */
function getTimeZone(ss) {
  try {
    return (ss || getDb()).getSpreadsheetTimeZone() || "Asia/Jakarta";
  } catch (e) {
    return "Asia/Jakarta";
  }
}

/**
 * Helper: Upload Base64 Image to Google Drive and return direct public view URL
 */
function uploadImageToDrive(base64Data, filename, folderId) {
  try {
    if (!base64Data) return "";
    
    // Jika data sudah berupa URL (misal edit event tanpa ganti foto), langsung kembalikan
    if (typeof base64Data === "string" && (base64Data.startsWith("http://") || base64Data.startsWith("https://"))) {
      return base64Data;
    }

    const targetFolderId = folderId || getFolderId();
    let folder;
    if (targetFolderId) {
      try {
        folder = DriveApp.getFolderById(targetFolderId);
      } catch(e) {
        folder = DriveApp.getRootFolder();
      }
    } else {
      folder = DriveApp.getRootFolder();
    }
    
    let contentType = "image/jpeg";
    let rawBase64 = base64Data;
    
    if (base64Data.indexOf(",") > -1) {
      const splitData = base64Data.split(",");
      const match = splitData[0].match(/:(.*?);/);
      if (match) contentType = match[1];
      rawBase64 = splitData[1];
    }
    
    const blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), contentType, filename);
    const file = folder.createFile(blob);
    
    // Set agar bisa dilihat publik
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (err) {
    Logger.log("Upload image error: " + err.toString());
    return "";
  }
}

/**
 * Helper: Convert entire sheet data to Array of Objects
 */
function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const list = [];
  const tz = getTimeZone(sheet.getParent());
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      const headerKey = String(headers[j] || "").toLowerCase();
      if (val instanceof Date) {
        if (headerKey === "waktu" || headerKey === "time" || headerKey === "jam") {
          val = Utilities.formatDate(val, tz, "HH:mm");
        } else {
          val = Utilities.formatDate(val, tz, "yyyy-MM-dd");
        }
      }
      obj[headers[j]] = val;
    }
    list.push(obj);
  }
  return list;
}

function deleteRowById(sheet, id) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function formatDateStr(val, ss) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, getTimeZone(ss), "yyyy-MM-dd");
  }
  return String(val);
}

// =========================================================================
// TAB GEDUNG, SAKAN & HELPER OTOMATISASI
// =========================================================================
const DEFAULT_GEDUNG_DATA = [
  { id: "qazvin", nama: "QAZVIN", urutan: 1, aktif: true }
];

const DEFAULT_SAKAN_DATA = [
  { id: "qazvin-atas", nama: "QAZVIN ATAS", gedung: "QAZVIN", urutan: 1, aktif: true }
];

/**
 * =========================================================================
 * SETUP SPREADSHEET (Jalankan sekali di Apps Script Editor untuk inisialisasi awal)
 * =========================================================================
 * Menyiapkan 6 tab struktur database sesuai kebutuhan:
 * 1. Users   : 1 admin awal (username: admin, password: admin123)
 * 2. Klasemen: header saja
 * 3. Liga    : header saja (timA & timB = Gedung)
 * 4. Event   : header saja
 * 5. Gedung  : 1 entry gedung awal (QAZVIN)
 * 6. Sakan   : 1 entry sakan awal (QAZVIN ATAS, gedung: QAZVIN)
 */
function setupDatabase() {
  const ss = getDb();

  function ensureSheet(name, headers, initialRows) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
    if (sheet.getLastRow() === 1 && initialRows && initialRows.length > 0) {
      initialRows.forEach(row => sheet.appendRow(row));
    }
    return sheet;
  }

  // 1. Users (1 admin awal jika tab kosong)
  ensureSheet("Users", 
    ["username", "password", "role", "label", "status"],
    [["admin", "admin123", "admin_utama", "Admin Utama", "active"]]
  );

  // 2. Klasemen (header saja)
  ensureSheet("Klasemen", ["id", "tanggal", "sakan", "kebersihan", "kedisiplinan", "bahasa", "totalPoin"]);

  // 3. Liga (header saja)
  ensureSheet("Liga", ["id", "round", "tanggal", "waktu", "lokasi", "timA", "timB", "skorA", "skorB", "status"]);

  // 4. Event (header saja)
  ensureSheet("Event", ["id", "kategori", "tanggal", "waktu", "judul", "lokasi", "deskripsi", "foto"]);

  // 5. Gedung (1 gedung awal jika tab kosong)
  ensureSheet("Gedung", 
    ["id", "nama", "urutan", "aktif"],
    [["qazvin", "QAZVIN", 1, true]]
  );

  // 6. Sakan (1 sakan awal jika tab kosong)
  ensureSheet("Sakan", 
    ["id", "nama", "gedung", "urutan", "aktif"],
    [["qazvin-atas", "QAZVIN ATAS", "QAZVIN", 1, true]]
  );

  // Hapus sheet default bawaan Google Sheets jika ada
  const defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      Logger.log("Sheet default tidak dihapus: " + e.toString());
    }
  }

  Logger.log("Setup database berhasil diselesaikan!");
}

/**
 * Auto-heal master data: Menjamin susunan kolom, slug id, urutan, dan aktif (true)
 * terisi secara otomatis bahkan saat pengurus melakukan bulk paste di spreadsheet.
 */
function autoHealMasterData(ss) {
  if (!ss) ss = getDb();

  // 1. Healing Tab Gedung: id | nama | urutan | aktif
  let sheetGedung = ss.getSheetByName("Gedung");
  let gedungNames = [];
  if (sheetGedung && sheetGedung.getLastRow() > 1) {
    const dataRange = sheetGedung.getDataRange();
    const values = dataRange.getValues();
    let dirty = false;
    for (let i = 1; i < values.length; i++) {
      const nama = String(values[i][1] || "").trim();
      if (nama) {
        gedungNames.push(nama.toUpperCase());
        // Auto-generate id jika kosong
        if (!values[i][0]) {
          values[i][0] = nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          dirty = true;
        }
        // Auto-generate urutan jika kosong
        if (!values[i][2] && values[i][2] !== 0) {
          values[i][2] = i;
          dirty = true;
        }
        // Auto-generate aktif jika kosong
        if (values[i][3] === "" || values[i][3] == null || values[i][3] === undefined) {
          values[i][3] = true;
          dirty = true;
        }
      }
    }
    if (dirty) {
      dataRange.setValues(values);
    }
  }

  // 2. Healing Tab Sakan: id | nama | gedung | urutan | aktif
  let sheetSakan = ss.getSheetByName("Sakan");
  if (sheetSakan) {
    const lastRow = sheetSakan.getLastRow();
    const lastCol = sheetSakan.getLastColumn();
    if (lastRow >= 1) {
      let headers = sheetSakan.getRange(1, 1, 1, Math.max(lastCol, 5)).getValues()[0];
      // Jika kolom ke-3 adalah "urutan", berarti kolom "gedung" hilang/tergeser!
      if (String(headers[2]).toLowerCase() === "urutan") {
        sheetSakan.insertColumnAfter(2);
        sheetSakan.getRange(1, 3).setValue("gedung");
      } else if (headers[0] !== "id" || headers[1] !== "nama" || headers[2] !== "gedung") {
        sheetSakan.getRange(1, 1, 1, 5).setValues([["id", "nama", "gedung", "urutan", "aktif"]]);
      }

      if (sheetSakan.getLastRow() > 1) {
        const sDataRange = sheetSakan.getDataRange();
        const sValues = sDataRange.getValues();
        let sDirty = false;
        for (let i = 1; i < sValues.length; i++) {
          const sNama = String(sValues[i][1] || "").trim();
          if (sNama) {
            // Slug id
            if (!sValues[i][0]) {
              sValues[i][0] = sNama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
              sDirty = true;
            }
            // Gedung auto-match dari nama sakan jika kosong
            if (!sValues[i][2] || String(sValues[i][2]).trim() === "") {
              const matched = gedungNames.find(g => sNama.toUpperCase().startsWith(g) || sNama.toUpperCase().includes(g));
              if (matched) {
                sValues[i][2] = matched;
                sDirty = true;
              }
            }
            // Urutan
            if (!sValues[i][3] && sValues[i][3] !== 0) {
              sValues[i][3] = i;
              sDirty = true;
            }
            // Aktif
            if (sValues[i][4] === "" || sValues[i][4] == null || sValues[i][4] === undefined) {
              sValues[i][4] = true;
              sDirty = true;
            }
          }
        }
        if (sDirty) {
          sDataRange.setValues(sValues);
        }
      }
    }
  }
}

/**
 * Trigger onEdit: Otomatis memicu autoHealMasterData saat pengurus
 * mengedit atau melakukan bulk paste di tab 'Gedung' atau 'Sakan'.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  if (sheetName === "Gedung" || sheetName === "Sakan") {
    autoHealMasterData(sheet.getParent());
  }
}