// ============================================================
// KPI DASHBOARD — Google Apps Script Backend
// Iron Foundry ACE-1 & ACE-2 | FY2026
// Deploy sebagai Web App: Execute as Me, Anyone can access
// ============================================================

// Auto-detect Spreadsheet ID dari file ini terikat
const SS = SpreadsheetApp.getActiveSpreadsheet();

// ─── CORS HEADERS ───────────────────────────────────────────
// Apps Script tidak support OPTIONS preflight, jadi kita
// pakai Content-Type: text/plain di sisi client (simple request)
// agar browser tidak kirim preflight. Ini pattern standar GAS.
function setCORSHeaders(output) {
  return output; // GAS otomatis set CORS untuk Web App "Anyone"
}

// ─── HELPER: Ambil config dari tab CONFIG ───────────────────
function getConfig() {
  const sheet = SS.getSheetByName('CONFIG');
  if (!sheet) throw new Error('Tab CONFIG tidak ditemukan');
  const rows = sheet.getDataRange().getValues();
  const config = {};
  rows.forEach(row => {
    if (row[0]) config[String(row[0]).trim()] = String(row[1]).trim();
  });
  return config;
}

// ─── HELPER: Generate ID unik per sheet ─────────────────────
function generateId(sheetName) {
  const sheet = SS.getSheetByName(sheetName);
  const lastRow = sheet.getLastRow(); // termasuk header
  const prefix = sheetName.substring(0, 3).toUpperCase();
  const seq = String(Math.max(lastRow, 1)).padStart(5, '0');
  return prefix + '-' + seq + '-' + Date.now().toString(36).toUpperCase();
}

// ─── HELPER: Buat response JSON ─────────────────────────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — Endpoint untuk form submit dari dashboard web
// Dipanggil via: fetch(URL, {method:'POST', body: JSON.stringify(payload)})
// ============================================================
function doPost(e) {
  try {
    // 1. Parse body
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'Request body kosong' });
    }
    const payload = JSON.parse(e.postData.contents);

    // 2. Validasi operator_code
    const config = getConfig();
    const secret = config['operator_secret'] || 'FOUNDRY2026';
    if (!payload.operator_code || payload.operator_code !== secret) {
      return jsonResponse({ status: 'error', message: 'Operator code tidak valid' });
    }

    // 3. Tentukan sheet target
    const sheetName = payload.sheet_name;
    const allowedSheets = ['DAILY_INPUT', 'MONTHLY_SUMMARY', 'REJECTION_DETAIL'];
    if (!sheetName || !allowedSheets.includes(sheetName)) {
      return jsonResponse({
        status: 'error',
        message: 'sheet_name tidak valid. Pilihan: ' + allowedSheets.join(', ')
      });
    }

    const targetSheet = SS.getSheetByName(sheetName);
    if (!targetSheet) {
      return jsonResponse({ status: 'error', message: 'Sheet ' + sheetName + ' tidak ditemukan' });
    }

    // 4. Generate ID & timestamp
    const newId = generateId(sheetName);
    const timestamp = new Date().toISOString();

    // 5. Build row sesuai schema sheet
    let newRow;
    if (sheetName === 'DAILY_INPUT')      newRow = buildDailyInputRow(payload, newId, timestamp);
    if (sheetName === 'MONTHLY_SUMMARY')  newRow = buildMonthlySummaryRow(payload, newId, timestamp);
    if (sheetName === 'REJECTION_DETAIL') newRow = buildRejectionDetailRow(payload, newId, timestamp);

    // 6. Append ke sheet
    targetSheet.appendRow(newRow);

    // 7. Return sukses
    return jsonResponse({
      status: 'ok',
      id: newId,
      timestamp: timestamp,
      sheet: sheetName,
      rows_after: targetSheet.getLastRow() - 1 // jumlah data (minus header)
    });

  } catch (err) {
    // Log error ke Apps Script console untuk debugging
    console.error('doPost error:', err.toString(), err.stack);
    return jsonResponse({
      status: 'error',
      message: 'Server error: ' + err.message,
      // Jangan expose stack trace ke client di production
    });
  }
}

// ============================================================
// doGet — Endpoint baca data (fallback / admin use)
// URL: ?sheet=DAILY_INPUT&limit=100&offset=0&date_from=2026-04-01
// ============================================================
function doGet(e) {
  try {
    const params   = e.parameter || {};
    const sheetName = params.sheet  || 'DAILY_INPUT';
    const limit     = Math.min(parseInt(params.limit  || '200'), 1000); // max 1000
    const offset    = Math.max(parseInt(params.offset || '0'),   0);
    const dateFrom  = params.date_from || null; // format YYYY-MM-DD
    const dateTo    = params.date_to   || null;

    const sheet = SS.getSheetByName(sheetName);
    if (!sheet) {
      return jsonResponse({ status: 'error', message: 'Sheet tidak ditemukan: ' + sheetName });
    }

    const allData = sheet.getDataRange().getValues();
    if (allData.length < 2) {
      return jsonResponse({ status: 'ok', data: [], total: 0 });
    }

    const headers = allData[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    let rows = allData.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        // Konversi Date objects ke string ISO
        obj[h] = row[i] instanceof Date ? row[i].toISOString().split('T')[0] : row[i];
      });
      return obj;
    }).filter(row => row[headers[0]] !== ''); // Filter baris kosong

    // Filter by date jika ada parameter
    const dateColIndex = headers.indexOf('date');
    if (dateFrom && dateColIndex >= 0) {
      rows = rows.filter(row => row['date'] >= dateFrom);
    }
    if (dateTo && dateColIndex >= 0) {
      rows = rows.filter(row => row['date'] <= dateTo);
    }

    const total = rows.length;
    const paginated = rows.slice(offset, offset + limit);

    return jsonResponse({
      status: 'ok',
      sheet: sheetName,
      total: total,
      limit: limit,
      offset: offset,
      data: paginated
    });

  } catch (err) {
    console.error('doGet error:', err.toString());
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ============================================================
// ROW BUILDERS — sesuai urutan kolom di setiap tab
// ============================================================

// Tab DAILY_INPUT — 30 kolom
function buildDailyInputRow(p, id, ts) {
  const n = v => (v !== undefined && v !== null && v !== '') ? Number(v) : 0;
  const s = v => v !== undefined ? String(v).trim() : '';
  return [
    id,                          // id
    ts,                          // timestamp
    s(p.date),                   // date (YYYY-MM-DD)
    s(p.shift),                  // shift
    s(p.submitted_by),           // submitted_by
    s(p.operator_code),          // operator_code (disimpan untuk audit)
    // ACE-1
    n(p.ace1_moldh),             // ace1_moldh
    n(p.ace1_prod_pct),          // ace1_prod_pct (0-1)
    n(p.ace1_bdt_loss),          // ace1_bdt_loss (0-1)
    n(p.ace1_pw_loss),           // ace1_pw_loss
    n(p.ace1_mold_loss),         // ace1_mold_loss
    n(p.ace1_other_loss),        // ace1_other_loss
    // ACE-2
    n(p.ace2_moldh),             // ace2_moldh
    n(p.ace2_prod_pct),          // ace2_prod_pct
    n(p.ace2_bdt_loss),          // ace2_bdt_loss
    n(p.ace2_pw_loss),           // ace2_pw_loss
    n(p.ace2_mold_loss),         // ace2_mold_loss
    n(p.ace2_other_loss),        // ace2_other_loss
    // Output & Reject
    n(p.reject_ace1_pcs),        // reject_ace1_pcs
    n(p.reject_ace2_pcs),        // reject_ace2_pcs
    n(p.output_ace1_mold),       // output_ace1_mold
    n(p.output_ace2_mold),       // output_ace2_mold
    // Finishing & Core
    n(p.finishing_prod_pct),     // finishing_prod_pct
    n(p.core_prod_pct),          // core_prod_pct
    // Safety
    n(p.safety_incident),        // safety_incident (0 atau 1)
    s(p.safety_type),            // safety_type
    s(p.safety_desc),            // safety_desc
    // Energi
    n(p.elec_furnace_kwh),       // elec_furnace_kwh
    n(p.elec_nonfurnace_kwh),    // elec_nonfurnace_kwh
    s(p.notes)                   // notes
  ];
}

// Tab MONTHLY_SUMMARY — 9 kolom
function buildMonthlySummaryRow(p, id, ts) {
  const n = v => (v !== undefined && v !== null && v !== '') ? Number(v) : 0;
  return [
    id,
    String(p.year_month || ''),      // format: 2026-04
    n(p.steelshot_kg_ton),
    n(p.bentonite_kg_ton),
    n(p.manhour_molding),
    n(p.manhour_finishing),
    n(p.total_output_ton),
    String(p.notes || '')
  ];
}

// Tab REJECTION_DETAIL — 10 kolom
function buildRejectionDetailRow(p, id, ts) {
  const n = v => (v !== undefined && v !== null && v !== '') ? Number(v) : 0;
  return [
    id,
    String(p.date   || ''),
    String(p.line   || ''),          // ACE-1 atau ACE-2
    String(p.process_type || ''),
    n(p.reject_pcs),
    n(p.total_pcs),
    n(p.reject_pct),
    String(p.defect_category || ''),
    String(p.notes || '')
  ];
}

// ============================================================
// UTILITY — Bisa dijalankan manual dari Apps Script editor
// untuk verifikasi setup
// ============================================================
function testSetup() {
  try {
    const config = getConfig();
    Logger.log('CONFIG berhasil dibaca:');
    Logger.log(JSON.stringify(config));

    const sheets = ['KPI_TARGETS','DAILY_INPUT','MONTHLY_SUMMARY','REJECTION_DETAIL','CONFIG'];
    sheets.forEach(name => {
      const s = SS.getSheetByName(name);
      Logger.log(name + ': ' + (s ? 'OK (' + (s.getLastRow()-1) + ' baris data)' : 'TIDAK DITEMUKAN'));
    });
    Logger.log('Setup test selesai. Cek log di atas.');
  } catch(err) {
    Logger.log('ERROR: ' + err.toString());
  }
}

function testDoPost() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        sheet_name: 'DAILY_INPUT',
        operator_code: 'FOUNDRY2026',
        date: '2026-04-01',
        shift: 'Shift 1',
        submitted_by: 'Test Operator',
        ace1_moldh: 147.5, ace1_prod_pct: 0.963,
        ace1_bdt_loss: 0.012, ace1_pw_loss: 0.010,
        ace1_mold_loss: 0.005, ace1_other_loss: 0.010,
        ace2_moldh: 149.0, ace2_prod_pct: 0.974,
        ace2_bdt_loss: 0.011, ace2_pw_loss: 0.009,
        ace2_mold_loss: 0.004, ace2_other_loss: 0.002,
        reject_ace1_pcs: 42, reject_ace2_pcs: 38,
        output_ace1_mold: 1180, output_ace2_mold: 1192,
        finishing_prod_pct: 0.94, core_prod_pct: 0.97,
        safety_incident: 0, safety_type: '', safety_desc: '',
        elec_furnace_kwh: 4400, elec_nonfurnace_kwh: 1600,
        notes: 'Test submission dari Apps Script editor'
      })
    }
  };
  const result = doPost(mockEvent);
  Logger.log('doPost test result:');
  Logger.log(result.getContent());
}
