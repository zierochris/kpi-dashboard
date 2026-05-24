// ============================================================
// kpi-engine.js — Hitung KPI, RAG status, aggregasi per periode
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

// Hitung RAG status
function ragStatus(actual, target, lowerIsBetter) {
  if (actual === null || actual === undefined || actual === '' || isNaN(actual)) return 'nodata';
  const a = parseFloat(actual);
  const t = parseFloat(target);
  if (isNaN(a) || isNaN(t)) return 'nodata';

  const diff = lowerIsBetter ? (a - t) / (t || 1) : (t - a) / (t || 1);
  if (diff <= 0) return 'green';
  if (diff <= CONFIG.NEAR_MISS_PCT) return 'amber';
  return 'red';
}

// Warna & label per status
const RAG_STYLE = {
  green:  { bg:'#E8F5E9', text:'#1B5E20', label:'On Target',   icon:'✓' },
  amber:  { bg:'#FFF8E1', text:'#E65100', label:'Near Miss',   icon:'~' },
  red:    { bg:'#FDECEA', text:'#C62828', label:'Below Target', icon:'✗' },
  nodata: { bg:'#F5F5F5', text:'#9E9E9E', label:'No Data',     icon:'—' },
};

// ── Aggregasi data harian per periode ──
// period: 'today' | 'week' | 'month' | 'ytd'
function aggregateDaily(rows, period) {
  if (!rows || rows.length === 0) return null;

  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  // Filter berdasarkan periode
  let filtered = rows.filter(r => r.date);
  if (period === 'today') {
    filtered = filtered.filter(r => r.date === today);
  } else if (period === 'week') {
    const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
    filtered = filtered.filter(r => r.date >= weekAgo);
  } else if (period === 'month') {
    const monthStart = today.substring(0, 7) + '-01';
    filtered = filtered.filter(r => r.date >= monthStart);
  }
  // ytd = semua data yang ada

  if (filtered.length === 0) return null;

  // Helper: rata-rata kolom numerik (ignore 0 untuk denominasi)
  const avg = col => {
    const vals = filtered.map(r => parseFloat(r[col])).filter(v => !isNaN(v) && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  // Helper: total (sum)
  const sum = col => {
    const vals = filtered.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  // Hitung rejection rate dari pcs (lebih akurat dari rata-rata persen)
  const totalOutputACE1 = sum('output_ace1_mold') || 1;
  const totalOutputACE2 = sum('output_ace2_mold') || 1;
  const rejectRateACE1  = (sum('reject_ace1_pcs') || 0) / totalOutputACE1;
  const rejectRateACE2  = (sum('reject_ace2_pcs') || 0) / totalOutputACE2;

  // Gentani: weighted average (total kWH / total ton estimasi)
  // Estimasi ton dari output mold (pakai rata-rata jika tidak ada data ton)
  const furnaceKWH    = sum('elec_furnace_kwh');
  const nonFurnaceKWH = sum('elec_nonfurnace_kwh');
  const tonEstimate   = totalOutputACE1 * 0.012 + totalOutputACE2 * 0.012; // ~12 kg per mold
  const furnaceKwhT   = tonEstimate > 0 ? furnaceKWH / tonEstimate : null;
  const nonFurnKwhT   = tonEstimate > 0 ? nonFurnaceKWH / tonEstimate : null;

  return {
    ace1_moldh:      avg('ace1_moldh'),
    ace1_prod:       avg('ace1_prod_pct'),
    ace1_reject:     rejectRateACE1,
    ace2_moldh:      avg('ace2_moldh'),
    ace2_prod:       avg('ace2_prod_pct'),
    ace2_reject:     rejectRateACE2,
    finishing_prod:  avg('finishing_prod_pct'),
    core_prod:       avg('core_prod_pct'),
    furnace_kwh:     furnaceKwhT,
    nonfurnace_kwh:  nonFurnKwhT,
    manhour_molding: null, // dari MONTHLY_SUMMARY
    safety_incident: sum('safety_incident'),
    // Raw data untuk chart
    _rows:           filtered,
    _count:          filtered.length,
    _period:         period,
  };
}

// Bangun array scorecard siap render
function buildScorecard(aggregated) {
  if (!aggregated) return KPI_DEFS.map(kpi => ({
    ...kpi, actual: null, rag: 'nodata', fmtActual: '—', fmtTarget: fmt(kpi.target, kpi.fmt), gap: null, gapPct: null,
  }));

  // Map id ke actual value
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
    const gapPct = (gap !== null && kpi.target !== 0) ? gap / kpi.target : null;
    return {
      ...kpi,
      actual,
      rag,
      fmtActual: fmt(actual, kpi.fmt),
      fmtTarget: fmt(kpi.target, kpi.fmt),
      gap,
      gapPct,
      style: RAG_STYLE[rag],
    };
  });
}

// Data untuk chart trend (per hari dalam periode)
function buildTrendData(rows, limit = 30) {
  if (!rows || rows.length === 0) return { dates: [], ace1: [], ace2: [], reject1: [], reject2: [], target_moldh: 148.5, target_reject: 0.019 };

  // Ambil N hari terakhir, urutkan ascending
  const sorted = [...rows]
    .filter(r => r.date && parseFloat(r.ace1_moldh) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);

  return {
    dates:          sorted.map(r => r.date),
    ace1:           sorted.map(r => parseFloat(r.ace1_moldh) || null),
    ace2:           sorted.map(r => parseFloat(r.ace2_moldh) || null),
    reject1:        sorted.map(r => parseFloat(r.ace1_prod_pct) ? (parseFloat(r.reject_ace1_pcs) / (parseFloat(r.output_ace1_mold) || 1)) : null),
    reject2:        sorted.map(r => parseFloat(r.ace2_prod_pct) ? (parseFloat(r.reject_ace2_pcs) / (parseFloat(r.output_ace2_mold) || 1)) : null),
    target_moldh:   148.5,
    target_reject:  0.019,
  };
}
