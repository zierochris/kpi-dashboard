// ── XSS Prevention — sanitize user-input strings ──────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================
// data-loader.js — Fetch & parse data dari Google Sheets
// Phase 5.3: tambah getRejectionDetail, improved error handling
// ============================================================

const CACHE_TTL_MS = (CONFIG.AUTO_REFRESH_MINUTES || 10) * 60 * 1000;

function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
}

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch(e) { return null; }
}

// ── Parse gviz response dari Google Sheets ─────────────────
function parseGviz(rawText) {
  try {
    const clean = rawText.replace(/^[^{]*/, '').replace(/\);?\s*$/, '').trim();
    const gviz  = JSON.parse(clean);
    if (!gviz.table || !gviz.table.cols) return [];

    const headers = gviz.table.cols.map(c =>
      String(c.label || c.id || '').trim().toLowerCase().replace(/\s+/g, '_')
    );

    return (gviz.table.rows || []).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = row.c ? row.c[i] : null;
        let val = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : '') : '';
        // Konversi Date object ke string YYYY-MM-DD
        if (val instanceof Date) val = val.toISOString().split('T')[0];
        obj[h] = val;
      });
      return obj;
    }).filter(row => Object.values(row).some(v => v !== ''));
  } catch(e) {
    console.error('parseGviz error:', e);
    return [];
  }
}

// ── Fetch satu tab dari Google Sheets ──────────────────────
async function fetchSheet(sheetName, useCache = true) {
  const cacheKey = `gsheet_${sheetName}`;
  if (useCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PASTE_SHEET_ID_DISINI') {
    throw new Error('Sheet ID belum diisi di config.js');
  }

  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gagal fetch ${sheetName}: HTTP ${resp.status}. Pastikan Sheet sudah di-share publik (Viewer).`);

  const text = await resp.text();
  const data = parseGviz(text);
  cacheSet(cacheKey, data);
  return data;
}

// ── Public API ─────────────────────────────────────────────

// dashboardDays: fetch hanya N hari untuk dashboard (cepat)
// fullFetch: fetch semua untuk export CSV (lengkap)
async function getDailyInputs({ days = 180, full = false } = {}) {
  if (full) return await fetchSheet('DAILY_INPUT_FULL', false);

  // Untuk dashboard: ambil semua lalu filter client-side (gviz tidak support TQL date filter)
  // Cache key berbeda untuk full vs dashboard
  const key = `gsheet_DAILY_INPUT_${days}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const all = await fetchSheet('DAILY_INPUT', false); // no nested cache
  // Ambil N hari terakhir untuk performa dashboard
  if (!full && days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const filtered = all.filter(r => !r.date || String(r.date) >= cutoff);
    cacheSet(key, filtered);
    return filtered;
  }
  cacheSet(key, all);
  return all;
}

// Untuk export CSV — ambil semua data tanpa limit
async function getAllDailyInputs() {
  return await fetchSheet('DAILY_INPUT', false); // bypass cache untuk export
}

async function getMonthlySummary() {
  return await fetchSheet('MONTHLY_SUMMARY');
}

async function getRejectionDetail() {
  return await fetchSheet('REJECTION_DETAIL');
}

async function getKPITargets() {
  const rows = await fetchSheet('KPI_TARGETS');
  const map  = {};
  rows.forEach(r => {
    if (r.kpi_id) map[r.kpi_id] = {
      target:        parseFloat(r.target) || 0,
      unit:          r.unit || '',
      lowerIsBetter: String(r.lower_is_better).toUpperCase() === 'TRUE',
    };
  });
  return map;
}

function clearCache() {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith('gsheet_'))
    .forEach(k => sessionStorage.removeItem(k));
}

// ── Submit form ke Apps Script ──────────────────────────────
async function submitData(sheetName, formData) {
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'PASTE_APPS_SCRIPT_URL_DISINI') {
    throw new Error('Apps Script URL belum diisi di config.js');
  }

  const payload = {
    sheet_name:    sheetName,
    operator_code: CONFIG.OPERATOR_SECRET,
    ...formData,
  };

  const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`);

  const result = await resp.json();
  if (result.status !== 'ok') throw new Error(result.message || 'Submit gagal');

  clearCache();
  return result;
}
