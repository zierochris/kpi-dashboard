// ============================================================
// kpi-engine.js — Hitung KPI, RAG status, aggregasi per periode
// Phase 5.3: FY-aware YTD, monthly data integration, completeness
// ============================================================

// Format angka sesuai tipe
function fmt(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  switch (type) {
    case 'pct0':  return (n * 100).toFixed(1) + '%';
    case 'pct2':  return (n * 100).toFixed(2) + '%';
    case 'num1':  return n.toFixed(1);
    case 'int':   return Math.round(n).toString();
    default:      return n.toFixed(1);
  }
}

// Hitung RAG status — lower_is_better dibalik logika
function ragStatus(actual, target, lowerIsBetter) {
  if (actual === null || actual === undefined || actual === '' || isNaN(parseFloat(actual))) return 'nodata';
  const a = parseFloat(actual);
  const t = parseFloat(target);
  if (isNaN(a) || isNaN(t)) return 'nodata';
  const diff = lowerIsBetter ? (a - t) / (t || 1) : (t - a) / (t || 1);
  if (diff <= 0)                        return 'green';
  if (diff <= CONFIG.NEAR_MISS_PCT)     return 'amber';
  return 'red';
}

const RAG_STYLE = {
  green:  { bg:'#E8F5E9', text:'#1B5E20', label:'On Target',    icon:'✓' },
  amber:  { bg:'#FFF8E1', text:'#E65100', label:'Near Miss',    icon:'~' },
  red:    { bg:'#FDECEA', text:'#C62828', label:'Below Target', icon:'✗' },
  nodata: { bg:'#F5F5F5', text:'#9E9E9E', label:'No Data',      icon:'—' },
};

// ── Tanggal helper ──────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function fyStartDate() {
  // Auto-detect fiscal year berdasarkan tanggal sekarang
  // FY mulai bulan FY_START_MONTH (default April = bulan 4)
  const startMonth = CONFIG.FY_START_MONTH || 4;
  const now        = new Date();
  const curMonth   = now.getMonth() + 1; // 1-12
  const curYear    = now.getFullYear();
  // Jika bulan sekarang >= start month → FY dimulai tahun ini
  // Jika bulan sekarang < start month  → FY dimulai tahun lalu
  const fyYear = curMonth >= startMonth ? curYear : curYear - 1;
  return `${fyYear}-${String(startMonth).padStart(2,'0')}-01`;
}

function currentYearMonth() {
  return todayStr().substring(0, 7); // YYYY-MM
}

// ── Quarter helpers ──────────────────────────────────────────

// Kembalikan FY year yang sedang berjalan (misal: 2026 untuk FY2026)
function currentFYYear() {
  const startMonth = CONFIG.FY_START_MONTH || 4;
  const now        = new Date();
  const curMonth   = now.getMonth() + 1;
  const curYear    = now.getFullYear();
  return curMonth >= startMonth ? curYear : curYear - 1;
}

/**
 * Kembalikan bounds {start, end, label} untuk satu quarter FY.
 * @param {string} quarter  'q1' | 'q2' | 'q3' | 'q4'
 * @param {number} fyYear   Tahun FY (default: tahun FY berjalan)
 *
 * Layout FY default (startMonth = 4 / April):
 *   Q1 = Apr–Jun  (bulan  4,5,6  tahun fyYear)
 *   Q2 = Jul–Sep  (bulan  7,8,9  tahun fyYear)
 *   Q3 = Oct–Dec  (bulan 10,11,12 tahun fyYear)
 *   Q4 = Jan–Mar  (bulan  1,2,3  tahun fyYear+1)
 */
function getQuarterBounds(quarter, fyYear) {
  const sm = CONFIG.FY_START_MONTH || 4;          // 4 = April
  const fy = fyYear || currentFYYear();
  const fyLabel = String(fy).slice(-2);            // "26"

  // Hitung bulan awal setiap quarter berdasarkan startMonth
  const qMonths = [
    { start: sm,       end: sm + 2 },              // Q1
    { start: sm + 3,   end: sm + 5 },              // Q2
    { start: sm + 6,   end: sm + 8 },              // Q3
    { start: sm + 9,   end: sm + 11 },             // Q4 (bisa overflow ke tahun berikut)
  ];

  const qi    = { q1:0, q2:1, q3:2, q4:3 }[quarter];
  if (qi === undefined) return null;

  const qm    = qMonths[qi];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Normalise bulan: jika > 12, rollover ke tahun berikut
  function normalise(m, baseYear) {
    const y = baseYear + Math.floor((m - 1) / 12);
    const mo = ((m - 1) % 12) + 1;
    return { year: y, month: mo };
  }

  const s  = normalise(qm.start, fy);
  const e  = normalise(qm.end,   fy);

  // Last day of end month
  const lastDay = new Date(e.year, e.month, 0).getDate(); // day 0 of next month = last day

  const startStr = `${s.year}-${String(s.month).padStart(2,'0')}-01`;
  const endStr   = `${e.year}-${String(e.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const sName = MONTH_NAMES[s.month - 1];
  const eName = MONTH_NAMES[e.month - 1];
  const label = `Q${qi + 1} FY${fyLabel} (${sName}–${eName} ${s.year !== e.year ? e.year : s.year})`;

  return { start: startStr, end: endStr, label, quarter, fyYear: fy };
}

// Deteksi quarter yang sedang berjalan berdasarkan tanggal hari ini
function currentQuarter() {
  const today = new Date();
  const m     = today.getMonth() + 1; // 1-12
  const sm    = CONFIG.FY_START_MONTH || 4;

  // Offset dari start month (0-11)
  const offset = ((m - sm) + 12) % 12;

  if (offset < 3)  return 'q1';
  if (offset < 6)  return 'q2';
  if (offset < 9)  return 'q3';
  return 'q4';
}

// ── Aggregasi data harian per periode ──────────────────────
// period: 'today' | 'week' | 'month' | 'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom'
// customFrom / customTo: string 'YYYY-MM-DD' (dipakai saat period === 'custom')
function aggregateDaily(rows, period, customFrom, customTo) {
  if (!rows || rows.length === 0) return null;

  const today   = todayStr();
  const fyStart = fyStartDate();

  let filtered = rows.filter(r => r.date);

  if (period === 'today') {
    filtered = filtered.filter(r => String(r.date) === today);
  } else if (period === 'week') {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    filtered = filtered.filter(r => String(r.date) >= weekAgo);
  } else if (period === 'month') {
    const monthStart = today.substring(0, 7) + '-01';
    filtered = filtered.filter(r => String(r.date) >= monthStart);
  } else if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
    const bounds = getQuarterBounds(period);
    if (bounds) {
      filtered = filtered.filter(r => String(r.date) >= bounds.start && String(r.date) <= bounds.end);
    }
  } else if (period === 'custom' && customFrom && customTo) {
    filtered = filtered.filter(r => String(r.date) >= customFrom && String(r.date) <= customTo);
  } else if (period === 'ytd') {
    // FY-aware: mulai dari April (fyStart)
    filtered = filtered.filter(r => String(r.date) >= fyStart);
  }

  if (filtered.length === 0) return null;

  const avg = col => {
    const vals = filtered
      .map(r => parseFloat(r[col]))
      .filter(v => !isNaN(v) && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const sum = col => {
    const vals = filtered.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  // Rejection rate: total pcs / total output (lebih akurat dari rata-rata %)
  const totalOut1 = sum('output_ace1_mold') || 1;
  const totalOut2 = sum('output_ace2_mold') || 1;
  const rejRate1  = (sum('reject_ace1_pcs') || 0) / totalOut1;
  const rejRate2  = (sum('reject_ace2_pcs') || 0) / totalOut2;

  // Gentani weighted average: total kWH / estimasi ton
  const furnKwh    = sum('elec_furnace_kwh')    || 0;
  const nonFurnKwh = sum('elec_nonfurnace_kwh') || 0;
  const tonEst     = (totalOut1 + totalOut2) * 0.012; // ~12 kg/mold
  const furnKwhT   = tonEst > 0 ? furnKwh    / tonEst : null;
  const nonFurnT   = tonEst > 0 ? nonFurnKwh / tonEst : null;

  return {
    ace1_moldh:      avg('ace1_moldh'),
    ace1_prod:       avg('ace1_prod_pct'),
    ace1_reject:     rejRate1,
    ace2_moldh:      avg('ace2_moldh'),
    ace2_prod:       avg('ace2_prod_pct'),
    ace2_reject:     rejRate2,
    finishing_prod:  avg('finishing_prod_pct'),
    core_prod:       avg('core_prod_pct'),
    furnace_kwh:     furnKwhT,
    nonfurnace_kwh:  nonFurnT,
    manhour_molding: null,          // diisi dari MONTHLY_SUMMARY
    safety_incident: sum('safety_incident'),
    // Meta
    _rows:   filtered,
    _count:  filtered.length,
    _period: period,
    _totalOut1: totalOut1,
    _totalOut2: totalOut2,
  };
}

// ── Integrasi data MONTHLY_SUMMARY ke aggregated ───────────
// monthlySummary: array of row objects dari tab MONTHLY_SUMMARY
function injectMonthlyData(aggregated, monthlySummary, period) {
  if (!aggregated || !monthlySummary || monthlySummary.length === 0) return aggregated;

  let relevantRows = [];

  if (period === 'today' || period === 'week') {
    // Pakai bulan terakhir yang ada data
    relevantRows = [monthlySummary[monthlySummary.length - 1]];
  } else if (period === 'month') {
    const ym = currentYearMonth();
    relevantRows = monthlySummary.filter(r => String(r.year_month) === ym);
  } else if (period === 'ytd') {
    // Rata-rata semua bulan FY yang sudah ada data
    const fyStart = fyStartDate().substring(0, 7); // YYYY-MM
    relevantRows = monthlySummary.filter(r => String(r.year_month) >= fyStart);
  }

  if (relevantRows.length === 0) return aggregated;

  const avgMH = rows => {
    const vals = rows.map(r => parseFloat(r.manhour_molding)).filter(v => !isNaN(v) && v > 0);
    return vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : null;
  };

  aggregated.manhour_molding = avgMH(relevantRows);
  return aggregated;
}

// ── Hitung kelengkapan data untuk periode ──────────────────
function calcCompleteness(rows, period, customFrom, customTo) {
  if (!rows || rows.length === 0) return { filled: 0, expected: 0, pct: 0, label: '' };

  const today   = todayStr();
  const fyStart = fyStartDate();

  let filtered   = rows.filter(r => r.date);
  let daysPassed = 1;
  let periodLabel = '';

  if (period === 'today') {
    filtered    = filtered.filter(r => String(r.date) === today);
    daysPassed  = 1;
    periodLabel = 'Hari Ini';
  } else if (period === 'week') {
    const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    filtered    = filtered.filter(r => String(r.date) >= weekAgo);
    daysPassed  = 7;
    periodLabel = '7 Hari';
  } else if (period === 'month') {
    const monthStart = today.substring(0,7) + '-01';
    filtered    = filtered.filter(r => String(r.date) >= monthStart);
    daysPassed  = new Date().getDate();
    periodLabel = 'Bulan Ini';
  } else if (period === 'ytd') {
    filtered    = filtered.filter(r => String(r.date) >= fyStart);
    const ms    = new Date(fyStart);
    daysPassed  = Math.ceil((Date.now() - ms) / 86400000);
    periodLabel = 'YTD FY26';
  } else if (period === 'q1' || period === 'q2' || period === 'q3' || period === 'q4') {
    const bounds = getQuarterBounds(period);
    if (bounds) {
      filtered    = filtered.filter(r => String(r.date) >= bounds.start && String(r.date) <= bounds.end);
      const start = new Date(bounds.start);
      const end   = new Date(Math.min(new Date(bounds.end), Date.now()));
      daysPassed  = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
      periodLabel = bounds.label;
    }
  } else if (period === 'custom' && customFrom && customTo) {
    filtered    = filtered.filter(r => String(r.date) >= customFrom && String(r.date) <= customTo);
    const start = new Date(customFrom);
    const end   = new Date(Math.min(new Date(customTo), Date.now()));
    daysPassed  = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const fmt   = d => new Date(d).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
    periodLabel = `${fmt(customFrom)} – ${fmt(customTo)}`;
  }

  const uniqueDays  = new Set(filtered.map(r => r.date)).size;
  const submissions = filtered.length;
  const expected    = daysPassed * 3; // 3 shift/hari

  return {
    filled:      submissions,
    days:        uniqueDays,
    expected:    expected,
    pct:         expected > 0 ? Math.min(100, Math.round(submissions / expected * 100)) : 0,
    periodLabel: periodLabel,
  };
}

// ══════════════════════════════════════════════════════════════
// PHASE 6.2 — COMPARISON ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Kembalikan bounds {start, end, label} untuk PERIODE SEBELUMNYA
 * berdasarkan period yang sedang aktif.
 *
 * Mapping:
 *   today  → kemarin
 *   week   → 7 hari sebelumnya (hari ke-8 s/d ke-14)
 *   month  → bulan kalender sebelumnya
 *   ytd    → FY sebelumnya (Apr 2025 – Mar 2026)
 *   q1/q2/q3/q4 → quarter yang sama, FY sebelumnya
 *   custom → rentang sama, mundur ke belakang
 */
function getPreviousPeriodBounds(currentPeriod, customFrom, customTo) {
  const today = todayStr();

  if (currentPeriod === 'today') {
    const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return { start: y, end: y, label: 'Kemarin' };
  }

  if (currentPeriod === 'week') {
    const to   = new Date(Date.now() - 8  * 86400000).toISOString().split('T')[0];
    const from = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    return { start: from, end: to, label: '7 Hari Sebelumnya' };
  }

  if (currentPeriod === 'month') {
    const now      = new Date();
    const prevM    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd  = new Date(now.getFullYear(), now.getMonth(), 0);
    const lbl      = prevM.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return {
      start: prevM.toISOString().split('T')[0],
      end:   prevEnd.toISOString().split('T')[0],
      label: lbl,
    };
  }

  if (currentPeriod === 'ytd') {
    // FY sebelumnya: Apr (prevFyYear) → Mar (prevFyYear+1)
    const fy       = currentFYYear();
    const prevFy   = fy - 1;
    const sm       = CONFIG.FY_START_MONTH || 4;
    const emMonth  = sm === 1 ? 12 : sm - 1;        // end month of prev FY
    const emYear   = sm === 1 ? prevFy : prevFy + 1;
    const lastDay  = new Date(emYear, emMonth, 0).getDate();
    return {
      start: `${prevFy}-${String(sm).padStart(2,'0')}-01`,
      end:   `${emYear}-${String(emMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
      label: `YTD FY${String(prevFy).slice(-2)}`,
    };
  }

  if (['q1','q2','q3','q4'].includes(currentPeriod)) {
    const prevFy = currentFYYear() - 1;
    const b      = getQuarterBounds(currentPeriod, prevFy);
    return b ? b : null;
  }

  if (currentPeriod === 'custom' && customFrom && customTo) {
    const from  = new Date(customFrom);
    const to    = new Date(customTo);
    const durMs = to.getTime() - from.getTime() + 86400000; // rentang inklusif
    const pTo   = new Date(from.getTime() - 86400000);
    const pFrom = new Date(pTo.getTime()  - durMs + 86400000);
    const iso   = d => d.toISOString().split('T')[0];
    const lbl   = d => d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
    return { start: iso(pFrom), end: iso(pTo), label: `${lbl(pFrom)} – ${lbl(pTo)}` };
  }

  return null;
}

/**
 * Hitung delta antara dua aggregated objects.
 * Kembalikan map: { kpi_id: { delta, deltaPct, direction, isImprovement } }
 *
 * direction: 'up' | 'down' | 'flat'
 * isImprovement:
 *   - true  = perubahan ini baik (hijau)
 *   - false = perubahan ini buruk (merah)
 *   - null  = tidak ada data sebelumnya
 */
function calcDelta(current, previous) {
  if (!current || !previous) return {};

  // Pasangan [key di aggregated, lowerIsBetter]
  const pairs = [
    ['ace1_moldh',      false],
    ['ace1_prod',       false],
    ['ace1_reject',     true ],
    ['ace2_moldh',      false],
    ['ace2_prod',       false],
    ['ace2_reject',     true ],
    ['finishing_prod',  false],
    ['core_prod',       false],
    ['furnace_kwh',     true ],
    ['nonfurnace_kwh',  true ],
    ['manhour_molding', true ],
    ['safety_incident', true ],
  ];

  const out = {};
  pairs.forEach(([key, lib]) => {
    const curr = current[key];
    const prev = previous[key];

    if (curr == null || prev == null || isNaN(curr) || isNaN(prev)) {
      out[key] = { delta: null, deltaPct: null, direction: 'flat', isImprovement: null };
      return;
    }

    const delta    = curr - prev;
    const EPSILON  = 0.00001;
    const direction = Math.abs(delta) < EPSILON ? 'flat' : delta > 0 ? 'up' : 'down';

    // Improvement: kalau lower_is_better → turun = baik; kalau higher_is_better → naik = baik
    const isImprovement = direction === 'flat'
      ? null
      : lib ? direction === 'down' : direction === 'up';

    out[key] = {
      delta,
      deltaPct: Math.abs(prev) > EPSILON ? delta / Math.abs(prev) : null,
      direction,
      isImprovement,
    };
  });

  return out;
}

// ── Public helper: aggregasi dengan date range bebas ───────
// Alias eksplisit — memanggil aggregateDaily dengan period='custom'
function aggregateByCustomRange(rows, dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  return aggregateDaily(rows, 'custom', dateFrom, dateTo);
}

// Kembalikan label human-readable untuk semua period type
function getPeriodLabel(period, customFrom, customTo) {
  const labels = {
    today: 'Hari Ini', week: '7 Hari', month: 'Bulan Ini', ytd: 'YTD FY26',
    q1: getQuarterBounds('q1')?.label || 'Q1',
    q2: getQuarterBounds('q2')?.label || 'Q2',
    q3: getQuarterBounds('q3')?.label || 'Q3',
    q4: getQuarterBounds('q4')?.label || 'Q4',
  };
  if (period === 'custom' && customFrom && customTo) {
    const fmt = d => new Date(d).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
    return `${fmt(customFrom)} – ${fmt(customTo)}`;
  }
  return labels[period] || period;
}


function buildScorecard(aggregated) {
  if (!aggregated) return KPI_DEFS.map(kpi => ({
    ...kpi,
    actual:    null,
    rag:       'nodata',
    fmtActual: '—',
    fmtTarget: fmt(kpi.target, kpi.fmt),
    gap:       null,
    gapPct:    null,
    style:     RAG_STYLE['nodata'],
  }));

  const valueMap = {
    ace1_moldh:      aggregated.ace1_moldh,
    ace1_prod:       aggregated.ace1_prod,
    ace1_reject:     aggregated.ace1_reject,
    ace2_moldh:      aggregated.ace2_moldh,
    ace2_prod:       aggregated.ace2_prod,
    ace2_reject:     aggregated.ace2_reject,
    finishing_prod:  aggregated.finishing_prod,
    core_prod:       aggregated.core_prod,
    furnace_kwh:     aggregated.furnace_kwh,
    nonfurnace_kwh:  aggregated.nonfurnace_kwh,
    manhour_molding: aggregated.manhour_molding,
    safety_incident: aggregated.safety_incident,
  };

  return KPI_DEFS.map(kpi => {
    const actual = valueMap[kpi.id];
    const rag    = ragStatus(actual, kpi.target, kpi.lib);
    const gap    = (actual !== null && actual !== undefined) ? actual - kpi.target : null;
    const gapPct = (gap !== null && kpi.target !== 0)       ? gap / kpi.target    : null;
    return {
      ...kpi, actual, rag,
      fmtActual: fmt(actual, kpi.fmt),
      fmtTarget: fmt(kpi.target, kpi.fmt),
      gap, gapPct,
      style: RAG_STYLE[rag],
    };
  });
}

// ── Trend data untuk 4 chart utama ─────────────────────────
function buildTrendData(rows, limit = 30) {
  const empty = {
    dates:[], ace1:[], ace2:[], prod1:[], prod2:[],
    reject1:[], reject2:[], energy_furnace:[], energy_nonfurnace:[],
    target_moldh:148.5, target_reject:0.019, target_prod:0.97,
  };
  if (!rows || rows.length === 0) return empty;

  const sorted = [...rows]
    .filter(r => r.date && parseFloat(r.ace1_moldh) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-limit);

  if (sorted.length === 0) return empty;

  const lbl = d => String(d).replace(/^\d{4}-/, '').replace('-', '/');
  const rejRate = (pcs, out) => {
    const p = parseFloat(pcs), o = parseFloat(out);
    return (o > 0 && !isNaN(p)) ? p / o : null;
  };

  return {
    dates:            sorted.map(r => lbl(r.date)),
    ace1:             sorted.map(r => parseFloat(r.ace1_moldh)         || null),
    ace2:             sorted.map(r => parseFloat(r.ace2_moldh)         || null),
    prod1:            sorted.map(r => parseFloat(r.ace1_prod_pct)      || null),
    prod2:            sorted.map(r => parseFloat(r.ace2_prod_pct)      || null),
    reject1:          sorted.map(r => rejRate(r.reject_ace1_pcs, r.output_ace1_mold)),
    reject2:          sorted.map(r => rejRate(r.reject_ace2_pcs, r.output_ace2_mold)),
    energy_furnace:   sorted.map(r => parseFloat(r.elec_furnace_kwh)   || null),
    energy_nonfurnace:sorted.map(r => parseFloat(r.elec_nonfurnace_kwh)|| null),
    // Baca target dari KPI_DEFS agar sinkron dengan config.js
    target_moldh:   (KPI_DEFS.find(k=>k.id==='ace1_moldh')   || {target:148.5}).target,
    target_reject:  (KPI_DEFS.find(k=>k.id==='ace1_reject')  || {target:0.019}).target,
    target_prod:    (KPI_DEFS.find(k=>k.id==='ace1_prod')    || {target:0.97}).target,
  };
}

// ── Pareto data untuk Rejection Detail ─────────────────────
function buildRejectPareto(rejectionRows, limit = 8) {
  if (!rejectionRows || rejectionRows.length === 0) return { cats: [], vals: [], totals: [] };

  // Group by defect_category, sum reject_pcs
  const grouped = {};
  rejectionRows.forEach(r => {
    const cat = r.defect_category || 'Unknown';
    const pcs = parseFloat(r.reject_pcs) || 0;
    grouped[cat] = (grouped[cat] || 0) + pcs;
  });

  const sorted = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const total = sorted.reduce((s, [, v]) => s + v, 0);

  // Kumulatif % untuk Pareto line
  let cumSum = 0;
  const cumPct = sorted.map(([, v]) => {
    cumSum += v;
    return total > 0 ? Math.round(cumSum / total * 100) : 0;
  });

  return {
    cats:    sorted.map(([k]) => k),
    vals:    sorted.map(([, v]) => v),
    cumPct:  cumPct,
    total:   total,
  };
}
