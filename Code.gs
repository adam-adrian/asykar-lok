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
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
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
          return ContentService.createTextOutput(JSON.stringify({
            status: "error",
            message: "Akun ini telah dinonaktifkan."
          })).setMimeType(ContentService.MimeType.JSON);
        }

        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          user: {
            username: matched.username,
            role: matched.role || "admin_utama",
            label: matched.label || "Admin"
          },
          token: "tok_" + Utilities.getUuid()
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Username atau password salah."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ==========================================
    // B. MODUL KLASEMEN
    // ==========================================
    else if (action === "save_klasemen") {
      const sheet = ss.getSheetByName("Klasemen");
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
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const rowDate = formatDateStr(rows[i][1]);
        if (rowDate === payload.tanggal && String(rows[i][2]).toUpperCase() === String(payload.sakan).toUpperCase()) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
    }

    // ==========================================
    // C. MODUL LIGA / MATCH BOLA
    // ==========================================
    else if (action === "save_match") {
      const sheet = ss.getSheetByName("Liga");
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

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
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
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
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