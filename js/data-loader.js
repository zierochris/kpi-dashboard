// ============================================================
// data-loader.js — Ambil & parse data dari Google Sheets
// ============================================================

// Cache sederhana pakai sessionStorage (hilang saat tab ditutup)
const CACHE_TTL_MS = CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000 || 600000;

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) { /* sessionStorage penuh, skip */ }
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

// ── Parse format gviz Google Sheets (format aneh tapi reliable) ──
function parseGviz(rawText) {
  // Google Sheets bungkus JSON dengan "/*O_o*/\ngoogle.visualization.Query.setResponse(...);"
  const clean = rawText
    .replace(/^[^{]*/, '')  // hapus prefix
    .replace(/\);?\s*$/, '') // hapus suffix
    .trim();
  const gviz = JSON.parse(clean);

  if (!gviz.table || !gviz.table.cols) return [];

  // Ambil nama kolom dari header
  const headers = gviz.table.cols.map(c => c.label || c.id || '');

  // Konversi setiap row ke object
  return (gviz.table.rows || []).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const cell = row.c ? row.c[i] : null;
      obj[h] = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : '') : '';
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

// ── Fetch satu tab dari Google Sheets ──
async function fetchSheet(sheetName, limit = 500) {
  const cacheKey = `sheet_${sheetName}_${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Cek apakah Sheet ID sudah diisi
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PASTE_SHEET_ID_DISINI') {
    console.warn('Sheet ID belum diisi di config.js');
    return [];
  }

  // URL tanpa TQL query — lebih reliable, limit diterapkan di client
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gagal fetch ${sheetName}: HTTP ${resp.status}`);

  const text = await resp.text();
  const data = parseGviz(text);
  cacheSet(cacheKey, data);
  return data;
}

// ── Public API ──

// Ambil target KPI dari tab KPI_TARGETS
async function getKPITargets() {
  const rows = await fetchSheet('KPI_TARGETS', 50);
  const map = {};
  rows.forEach(r => {
    if (r.kpi_id) map[r.kpi_id] = {
      target: parseFloat(r.target) || 0,
      unit: r.unit || '',
      lowerIsBetter: String(r.lower_is_better).toUpperCase() === 'TRUE',
    };
  });
  return map;
}

// Ambil data harian dari DAILY_INPUT
async function getDailyInputs(limit = 200) {
  return await fetchSheet('DAILY_INPUT', limit);
}

// Ambil monthly summary dari MONTHLY_SUMMARY
async function getMonthlySummary() {
  return await fetchSheet('MONTHLY_SUMMARY', 50);
}

// Invalidate cache paksa (untuk manual refresh)
function clearCache() {
  const keys = Object.keys(sessionStorage).filter(k => k.startsWith('sheet_'));
  keys.forEach(k => sessionStorage.removeItem(k));
}

// ── Submit form ke Apps Script ──
async function submitData(sheetName, formData) {
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'PASTE_APPS_SCRIPT_URL_DISINI') {
    throw new Error('Apps Script URL belum diisi di config.js');
  }

  const payload = {
    sheet_name: sheetName,
    operator_code: CONFIG.OPERATOR_SECRET,
    ...formData,
  };

  // Content-Type: text/plain menghindari CORS preflight
  const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);

  const result = await resp.json();
  if (result.status !== 'ok') throw new Error(result.message || 'Submit gagal');

  // Invalidate cache agar data baru langsung tampil
  clearCache();
  return result;
}
