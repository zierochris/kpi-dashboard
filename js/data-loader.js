// ============================================================
// data-loader.js — Fetch & parse data dari Google Sheets
// Phase 6.4: Tiered cache (memory → sessionStorage → network)
//            Stale-while-revalidate, smart invalidation, size guard
// ============================================================

// ── Debug helper ────────────────────────────────────────────
function dbg(...args) {
  if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG_MODE) {
    console.info('[KPI]', ...args);
  }
}

// ── XSS Prevention ──────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ══════════════════════════════════════════════════════════════
// TIERED CACHE
// Tier 1: _mem  — in-memory Map (fastest, lost on page close)
// Tier 2: sessionStorage — survives refresh, TTL-based
// Tier 3: Network fetch
// ══════════════════════════════════════════════════════════════

const _mem          = {}; // {cacheKey: {data, ts}}
const CACHE_TTL_MS  = ((typeof CONFIG !== 'undefined' ? CONFIG.AUTO_REFRESH_MINUTES : 10) || 10) * 60000;
const MAX_SS_BYTES  = 2 * 1024 * 1024; // 2 MB — skip sessionStorage if data is larger

// Tier 1 write + Tier 2 write
function cacheSet(key, data) {
  const ts = Date.now();
  _mem[key] = { data, ts };

  try {
    const payload = JSON.stringify({ ts, data });
    if (payload.length <= MAX_SS_BYTES) {
      sessionStorage.setItem(key, payload);
      dbg(`Cache SET: ${key} (${(payload.length/1024).toFixed(0)} KB)`);
    } else {
      dbg(`Cache SKIP (${(payload.length/1024/1024).toFixed(1)} MB > 2 MB limit): ${key}`);
    }
  } catch(e) { /* sessionStorage full — memory cache still works */ }
}

// Tier 1 read → Tier 2 read → null
function cacheGet(key) {
  // Check memory first (no deserialization needed)
  const mem = _mem[key];
  if (mem) {
    if (Date.now() - mem.ts < CACHE_TTL_MS) {
      dbg(`Cache HIT (memory): ${key}`);
      return mem.data;
    }
    delete _mem[key]; // stale — evict
  }

  // Check sessionStorage
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      dbg(`Cache EXPIRED: ${key}`);
      return null;
    }
    dbg(`Cache HIT (sessionStorage): ${key} (${((Date.now()-ts)/1000).toFixed(0)}s old)`);
    _mem[key] = { data, ts }; // warm memory tier
    return data;
  } catch(e) { return null; }
}

// Invalidate ONE specific sheet (not all) — called after form submit
function cacheInvalidate(sheetName) {
  const key = `gsheet_${sheetName}`;
  delete _mem[key];
  try { sessionStorage.removeItem(key); } catch(e) {}
  dbg(`Cache INVALIDATED: ${sheetName}`);
}

// Invalidate all — called on manual refresh
function clearCache() {
  Object.keys(_mem).forEach(k => delete _mem[k]);
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('gsheet_'))
      .forEach(k => sessionStorage.removeItem(k));
  } catch(e) {}
  dbg('Cache CLEARED (all)');
}

// ── Parse gviz response ─────────────────────────────────────
function parseGviz(rawText) {
  try {
    const clean = rawText.replace(/^[^{]*/, '').replace(/\);?\s*$/, '').trim();
    const gviz  = JSON.parse(clean);
    if (!gviz.table || !gviz.table.cols) return [];

    const headers = gviz.table.cols.map(c =>
      String(c.label || c.id || '').trim().toLowerCase().replace(/\s+/g,'_')
    );

    return (gviz.table.rows || []).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = row.c ? row.c[i] : null;
        let v = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : '') : '';
        if (v instanceof Date) v = v.toISOString().split('T')[0];
        obj[h] = v;
      });
      return obj;
    }).filter(row => Object.values(row).some(v => v !== ''));
  } catch(e) {
    console.error('parseGviz error:', e);
    return [];
  }
}

// ── Network fetch (no cache logic) ──────────────────────────
async function _fetchNetwork(sheetName) {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PASTE_SHEET_ID_DISINI') {
    throw new Error('Sheet ID belum diisi di config.js');
  }

  const READABLE = ['DAILY_INPUT','MONTHLY_SUMMARY','REJECTION_DETAIL','KPI_TARGETS'];
  if (!READABLE.includes(sheetName)) throw new Error('Sheet tidak diizinkan: ' + sheetName);

  const t0  = Date.now();
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Gagal fetch ${sheetName}: HTTP ${resp.status}. ` +
      `Pastikan Sheet sudah di-share publik (Anyone with link → Viewer).`
    );
  }
  const text = await resp.text();
  const data = parseGviz(text);
  const ms   = Date.now() - t0;
  dbg(`Fetched: ${sheetName} in ${(ms/1000).toFixed(2)}s — ${data.length} rows`);
  return data;
}

// ── fetchSheet: tiered cache + stale-while-revalidate ────────
// onUpdate(freshData): optional callback called when background revalidation
//   completes with newer data (row count differs or ts changed)
async function fetchSheet(sheetName, { fresh = false, onUpdate = null } = {}) {
  const key = `gsheet_${sheetName}`;

  if (!fresh) {
    const cached = cacheGet(key);
    if (cached) {
      // Stale-while-revalidate: serve cached data immediately,
      // silently refresh in background if callback provided
      if (onUpdate) {
        _fetchNetwork(sheetName).then(newData => {
          cacheSet(key, newData);
          if (newData.length !== cached.length) {
            dbg(`Background refresh: ${sheetName} (${cached.length} → ${newData.length} rows)`);
            onUpdate(newData);
          }
        }).catch(() => {}); // silent fail — cached data is still good
      }
      return cached;
    }
  }

  // Cache miss or forced fresh → fetch from network
  const data = await _fetchNetwork(sheetName);
  cacheSet(key, data);
  return data;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

// Daily: 180-day limit for dashboard, full for export/history
async function getDailyInputs({ days = 180, full = false, onUpdate = null } = {}) {
  const key      = `gsheet_DAILY_INPUT`;
  const allData  = await fetchSheet('DAILY_INPUT', { onUpdate });

  if (full) return allData;

  // Client-side date filter for dashboard performance
  const cutoff  = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const filtered = allData.filter(r => !r.date || String(r.date) >= cutoff);
  dbg(`getDailyInputs: ${allData.length} total → ${filtered.length} rows (${days}d window)`);
  return filtered;
}

// Full data for history export
async function getAllDailyInputs() {
  return await fetchSheet('DAILY_INPUT', { fresh: false });
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

// Submit form to Apps Script
async function submitData(sheetName, formData) {
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'PASTE_APPS_SCRIPT_URL_DISINI') {
    throw new Error('Apps Script URL belum diisi di config.js');
  }

  const payload = { sheet_name: sheetName, operator_code: CONFIG.OPERATOR_SECRET, ...formData };

  const t0   = Date.now();
  const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`);
  const result = await resp.json();
  if (result.status !== 'ok') throw new Error(result.message || 'Submit gagal');

  dbg(`submitData: ${sheetName} OK in ${((Date.now()-t0)/1000).toFixed(2)}s — ID: ${result.id}`);

  // SMART INVALIDATION: hanya invalidate sheet yang baru saja berubah
  cacheInvalidate(sheetName);
  return result;
}
