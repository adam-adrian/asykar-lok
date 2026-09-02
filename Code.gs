/**
 * =========================================================================
 * BACKEND API GOOGLE APPS SCRIPT - LEAGUE OF KINDNESS (VERCEL PROXY READY)
 * =========================================================================
 * 
 * STRUKTUR SPREADSHEET (4 Tab):
 * 1. Tab "Users"    : username | password | role | label | status
 * 2. Tab "Klasemen" : id | tanggal | sakan | kebersihan | kedisiplinan | bahasa | totalPoin
 * 3. Tab "Liga"     : id | round | tanggal | timA | timB | skorA | skorB
 * 4. Tab "Event"    : id | kategori | tanggal | waktu | judul | lokasi | deskripsi | foto
 * 
 * 💡 TIPS AKUN:
 * Pengurus dapat menambah/mengubah akun admin atau juri langsung di Tab "Users"
 * tanpa perlu mengubah kode pemrograman apa pun!
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
  save_klasemen:   "*",
  delete_klasemen: ["admin_utama"],
  save_match:      ["admin_utama"],
  delete_match:    ["admin_utama"],
  save_event:      ["admin_utama"],
  delete_event:    ["admin_utama"]
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
    return { status: "error", message: "Aksi tidak dikenal: " + String(action) };
  }

  const session = getSession(token);
  if (!session) {
    return {
      status: "error",
      code: "unauthorized",
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
      code: "forbidden",
      message: "Peran Anda tidak berhak melakukan aksi ini."
    };
  }
  return null;
}

/**
 * 1. GET: Mengambil data PUBLIK saja (Klasemen, Liga, Event).
 * CATATAN KEAMANAN: Data akun di Tab "Users" TIDAK PERNAH dikirim via GET!
 */
function doGet(e) {
  try {
    const ss = getDb();
    const result = {
      klasemen: sheetToObjects(ss.getSheetByName("Klasemen")),
      liga: sheetToObjects(ss.getSheetByName("Liga")),
      event: sheetToObjects(ss.getSheetByName("Event"))
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
    // B. MODUL KLASEMEN
    // ==========================================
    else if (action === "save_klasemen") {
      let sheet = ss.getSheetByName("Klasemen");
      if (!sheet) {
        sheet = ss.insertSheet("Klasemen");
        sheet.appendRow(["id", "tanggal", "sakan", "kebersihan", "kedisiplinan", "bahasa", "totalPoin"]);
      }
      const rows = sheet.getDataRange().getValues();
      let rowIndex = -1;
      
      for (let i = 1; i < rows.length; i++) {
        const rowDate = formatDateStr(rows[i][1]);
        if (rowDate === payload.tanggal && String(rows[i][2]).toUpperCase() === String(payload.sakan).toUpperCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      
      const totalPoin = (Number(payload.kebersihan) || 0) + (Number(payload.kedisiplinan) || 0) + (Number(payload.bahasa) || 0);
      
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 4).setValue(payload.kebersihan != null ? payload.kebersihan : "");
        sheet.getRange(rowIndex, 5).setValue(payload.kedisiplinan != null ? payload.kedisiplinan : "");
        sheet.getRange(rowIndex, 6).setValue(payload.bahasa != null ? payload.bahasa : "");
        sheet.getRange(rowIndex, 7).setValue(totalPoin);
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
    else if (action === "delete_klasemen") {
      const sheet = ss.getSheetByName("Klasemen");
      if (sheet) {
        const rows = sheet.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          const rowDate = formatDateStr(rows[i][1]);
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
      let sheet = ss.getSheetByName("Liga");
      if (!sheet) {
        sheet = ss.insertSheet("Liga");
        sheet.appendRow(["id", "round", "tanggal", "timA", "timB", "skorA", "skorB"]);
      }
      sheet.appendRow([
        payload.id || Date.now().toString(),
        payload.round,
        payload.tanggal,
        payload.timA,
        payload.timB,
        payload.skorA,
        payload.skorB
      ]);
    }
    else if (action === "delete_match") {
      deleteRowById(ss.getSheetByName("Liga"), payload.id);
    }
    // ==========================================
    // D. MODUL EVENT & FOTO KEGIATAN
    // ==========================================
    else if (action === "save_event") {
      let fotoUrl = "";
      const folderId = getFolderId();
      
      if (payload.fotoBase64) {
        fotoUrl = uploadImageToDrive(payload.fotoBase64, "event_" + Date.now() + ".jpg", folderId);
      }
      
      let sheet = ss.getSheetByName("Event");
      if (!sheet) {
        sheet = ss.insertSheet("Event");
        sheet.appendRow(["id", "kategori", "tanggal", "waktu", "judul", "lokasi", "deskripsi", "foto"]);
      }
      
      sheet.appendRow([
        payload.id || Date.now().toString(),
        payload.kategori,
        payload.tanggal,
        payload.waktu,
        payload.judul,
        payload.lokasi,
        payload.deskripsi,
        fotoUrl
      ]);
    }
    else if (action === "delete_event") {
      deleteRowById(ss.getSheetByName("Event"), payload.id);
    }
    return jsonOut({ status: "success" });

  } catch (err) {
    return jsonOut({ status: "error", message: err.toString() });
  }
}

/**
 * Helper: Upload Base64 Image to Google Drive and return direct public view URL
 */
function uploadImageToDrive(base64Data, filename, folderId) {
  try {
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

    if (!base64Data) return "";
    
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
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      const headerKey = String(headers[j] || "").toLowerCase();
      if (val instanceof Date) {
        if (headerKey === "waktu" || headerKey === "time" || headerKey === "jam") {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
        } else {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
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
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function formatDateStr(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val);
}