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
  // FY2026 mulai April 2026
  const month = CONFIG.FY_START_MONTH || 4;
  const year  = CONFIG.FY_YEAR || 2026;
  return `${year}-${String(month).padStart(2,'0')}-01`;
}

function currentYearMonth() {
  return todayStr().substring(0, 7); // YYYY-MM
}

// ── Aggregasi data harian per periode ──────────────────────
// period: 'today' | 'week' | 'month' | 'ytd'
function aggregateDaily(rows, period) {
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
function calcCompleteness(rows, period) {
  if (!rows || rows.length === 0) return { filled: 0, expected: 0, pct: 0 };

  const today   = todayStr();
  const fyStart = fyStartDate();

  let filtered = rows.filter(r => r.date);
  let daysPassed = 1;

  if (period === 'today') {
    filtered   = filtered.filter(r => String(r.date) === today);
    daysPassed = 1;
  } else if (period === 'week') {
    const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    filtered   = filtered.filter(r => String(r.date) >= weekAgo);
    daysPassed = 7;
  } else if (period === 'month') {
    const monthStart = today.substring(0,7) + '-01';
    filtered   = filtered.filter(r => String(r.date) >= monthStart);
    daysPassed = new Date().getDate(); // hari dalam bulan ini
  } else if (period === 'ytd') {
    filtered   = filtered.filter(r => String(r.date) >= fyStart);
    const ms   = new Date(fyStart);
    daysPassed = Math.ceil((Date.now() - ms) / 86400000);
  }

  // Expected: 1 submission per shift, 3 shift per hari
  const uniqueDays  = new Set(filtered.map(r => r.date)).size;
  const submissions = filtered.length;
  const expected    = daysPassed * 3; // 3 shift

  return {
    filled:    submissions,
    days:      uniqueDays,
    expected:  expected,
    pct:       expected > 0 ? Math.min(100, Math.round(submissions / expected * 100)) : 0,
  };
}

// ── Bangun array scorecard siap render ─────────────────────
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
    target_moldh:     148.5,
    target_reject:    0.019,
    target_prod:      0.97,
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
