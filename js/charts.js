// ============================================================
// charts.js — Render semua ECharts di dashboard
// Phase 5.3: 4 chart utama + Pareto rejection
// ============================================================

// Baca chart config dari config.js (fallback ke default jika CHART_CONFIG belum ada)
const _cc = (typeof CHART_CONFIG !== 'undefined') ? CHART_CONFIG : {};

let _charts = {};

function initChart(id, option) {
  const el = document.getElementById(id);
  if (!el) return;
  if (_charts[id]) _charts[id].dispose();
  _charts[id] = echarts.init(el);
  _charts[id].setOption(option);
}

function resizeAllCharts() {
  Object.values(_charts).forEach(c => { try { c.resize(); } catch(e) {} });
}
window.addEventListener('resize', resizeAllCharts);

// Shared style constants
const GRID   = { top:36, right:16, bottom:36, left:52 };
const LEGEND = { bottom:2, textStyle:{ fontSize:11 }, itemWidth:12, itemHeight:8 };
const TOOLTIP_AXIS = { trigger:'axis', backgroundColor:'rgba(27,42,74,0.9)', textStyle:{ color:'#fff', fontSize:11 }, borderWidth:0 };
const AXIS_LBL = { fontSize:10, color:'#9ca3af' };
const LINE_TARGET = { color:'#C62828', width:1.5, type:'dashed' };

const C = { ace1:'#4472C4', ace2:'#ED7D31', target:'#C62828', purple:'#7030A0', green:'#70AD47', gold:'#C9A84C' };

function emptyChart(id, msg = 'Belum ada data untuk periode ini') {
  initChart(id, {
    graphic: [{
      type:'text', left:'center', top:'middle',
      style:{ text: msg, fontSize:13, fill:'#9ca3af' }
    }]
  });
}

// ── Chart 1: Mold/H Trend ───────────────────────────────────
function renderMoldhChart(data) {
  if (!data.dates || data.dates.length === 0) { emptyChart('chart-moldh'); return; }
  initChart('chart-moldh', {
    grid: GRID, legend: LEGEND, tooltip: {
      ...TOOLTIP_AXIS,
      formatter: p => p.map(s => `${s.marker}${s.seriesName}: <b>${s.value !== null ? s.value.toFixed(1) : '—'}</b>`).join('<br>')
    },
    xAxis: { type:'category', data:data.dates, axisLabel:{ ...AXIS_LBL, rotate: data.dates.length > 14 ? 30 : 0 } },
    yAxis: { type:'value', min:_cc.moldh_min||110, max:_cc.moldh_max||165, axisLabel:{ ...AXIS_LBL, formatter:'{value}' } },
    series: [
      { name:'ACE-1', type:'line', data:data.ace1, smooth:true,
        lineStyle:{color:C.ace1, width:2.5}, itemStyle:{color:C.ace1}, symbol:'circle', symbolSize:4 },
      { name:'ACE-2', type:'line', data:data.ace2, smooth:true,
        lineStyle:{color:C.ace2, width:2.5}, itemStyle:{color:C.ace2}, symbol:'circle', symbolSize:4 },
      { name:'Target 148.5', type:'line', data:data.dates.map(()=>data.target_moldh),
        lineStyle:LINE_TARGET, symbol:'none', itemStyle:{color:C.target} },
    ],
  });
}

// ── Chart 2: Rejection Rate Trend ───────────────────────────
function renderRejectChart(data) {
  if (!data.dates || data.dates.length === 0) { emptyChart('chart-reject'); return; }
  initChart('chart-reject', {
    grid: GRID, legend: LEGEND, tooltip: {
      ...TOOLTIP_AXIS,
      formatter: p => p.map(s => `${s.marker}${s.seriesName}: <b>${s.value !== null ? (s.value*100).toFixed(2)+'%' : '—'}</b>`).join('<br>')
    },
    xAxis: { type:'category', data:data.dates, axisLabel:{ ...AXIS_LBL, rotate: data.dates.length > 14 ? 30 : 0 } },
    yAxis: { type:'value', min:0, axisLabel:{ ...AXIS_LBL, formatter: v=>(v*100).toFixed(1)+'%' } },
    series: [
      { name:'ACE-1 Reject%', type:'line', data:data.reject1, smooth:true,
        lineStyle:{color:C.ace1, width:2.5}, itemStyle:{color:C.ace1}, symbol:'circle', symbolSize:4 },
      { name:'ACE-2 Reject%', type:'line', data:data.reject2, smooth:true,
        lineStyle:{color:C.ace2, width:2.5}, itemStyle:{color:C.ace2}, symbol:'circle', symbolSize:4 },
      { name:'Target 1.9%', type:'line', data:data.dates.map(()=>data.target_reject),
        lineStyle:LINE_TARGET, symbol:'none', itemStyle:{color:C.target} },
    ],
  });
}

// ── Chart 3: Productivity % ─────────────────────────────────
function renderProdChart(data) {
  if (!data.dates || data.dates.length === 0) { emptyChart('chart-prod'); return; }
  initChart('chart-prod', {
    grid: GRID, legend: LEGEND, tooltip: {
      ...TOOLTIP_AXIS,
      formatter: p => p.map(s => `${s.marker}${s.seriesName}: <b>${s.value !== null ? (s.value*100).toFixed(1)+'%' : '—'}</b>`).join('<br>')
    },
    xAxis: { type:'category', data:data.dates, axisLabel:{ ...AXIS_LBL, rotate: data.dates.length > 14 ? 30 : 0 } },
    yAxis: { type:'value', min:_cc.prod_min||0.80, max:1.02, axisLabel:{ ...AXIS_LBL, formatter: v=>(v*100).toFixed(0)+'%' } },
    series: [
      { name:'ACE-1 Prod%', type:'bar', data:data.prod1, barWidth:'35%', barGap:'10%',
        itemStyle:{ color:C.ace1, borderRadius:[3,3,0,0] } },
      { name:'ACE-2 Prod%', type:'bar', data:data.prod2, barWidth:'35%',
        itemStyle:{ color:C.ace2, borderRadius:[3,3,0,0] } },
      { name:'Target 97%', type:'line', data:data.dates.map(()=>data.target_prod),
        lineStyle:LINE_TARGET, symbol:'none', itemStyle:{color:C.target} },
    ],
  });
}

// ── Chart 4: Energy kWH ─────────────────────────────────────
function renderEnergyChart(data) {
  if (!data.dates || data.dates.length === 0) { emptyChart('chart-energy'); return; }

  const hasFurnace    = data.energy_furnace.some(v => v !== null);
  const hasNonFurnace = data.energy_nonfurnace.some(v => v !== null);

  if (!hasFurnace && !hasNonFurnace) {
    emptyChart('chart-energy', 'Isi data Gentani di form Input Harian\nuntuk melihat trend energi');
    return;
  }

  initChart('chart-energy', {
    grid: GRID, legend: LEGEND, tooltip: {
      ...TOOLTIP_AXIS,
      formatter: p => p.map(s => `${s.marker}${s.seriesName}: <b>${s.value !== null ? s.value.toLocaleString()+' kWH' : '—'}</b>`).join('<br>')
    },
    xAxis: { type:'category', data:data.dates, axisLabel:{ ...AXIS_LBL, rotate: data.dates.length > 14 ? 30 : 0 } },
    yAxis: { type:'value', axisLabel:{ ...AXIS_LBL, formatter: v => v >= 1000 ? (v/1000).toFixed(1)+'K' : v } },
    series: [
      { name:'Furnace kWH', type:'line', data:data.energy_furnace, smooth:true,
        lineStyle:{color:C.purple, width:2.5}, itemStyle:{color:C.purple}, symbol:'circle', symbolSize:4 },
      { name:'Non-Furnace kWH', type:'line', data:data.energy_nonfurnace, smooth:true,
        lineStyle:{color:C.green, width:2.5}, itemStyle:{color:C.green}, symbol:'circle', symbolSize:4 },
    ],
  });
}

// ── Chart 5: Rejection Pareto ───────────────────────────────
function renderParetoChart(paretoData) {
  if (!paretoData || paretoData.cats.length === 0) {
    emptyChart('chart-pareto', 'Belum ada data Rejection Detail.\nIsi tab REJECTION_DETAIL di Google Sheets.');
    return;
  }

  // Warna bar dari merah ke kuning (worst → less bad)
  const colors = ['#C62828','#D84315','#E65100','#EF6C00','#F57C00','#FB8C00','#FFA000','#FFB300'];

  initChart('chart-pareto', {
    grid: { top:36, right:60, bottom:60, left:52 },
    legend: { bottom:2, textStyle:{ fontSize:11 }, itemWidth:12, itemHeight:8 },
    tooltip: {
      trigger:'axis', axisPointer:{ type:'shadow' },
      backgroundColor:'rgba(27,42,74,0.9)', textStyle:{ color:'#fff', fontSize:11 }, borderWidth:0,
      formatter: p => {
        const bar = p.find(s => s.seriesName === 'Reject Pcs');
        const line = p.find(s => s.seriesName === 'Kumulatif %');
        return `<b>${p[0].axisValue}</b><br>
          ${bar ? `Reject: <b>${bar.value} pcs</b><br>` : ''}
          ${line ? `Kumulatif: <b>${line.value}%</b>` : ''}`;
      }
    },
    xAxis: [{ type:'category', data:paretoData.cats, axisLabel:{ fontSize:10, rotate:25, color:'#9ca3af' } }],
    yAxis: [
      { type:'value', name:'Pcs', axisLabel:{ fontSize:10, color:'#9ca3af' } },
      { type:'value', name:'%', min:0, max:100, axisLabel:{ fontSize:10, color:'#9ca3af', formatter:'{value}%' } }
    ],
    series: [
      { name:'Reject Pcs', type:'bar', data:paretoData.vals,
        itemStyle:{ color: (p) => colors[Math.min(p.dataIndex, colors.length-1)], borderRadius:[3,3,0,0] }
      },
      { name:'Kumulatif %', type:'line', yAxisIndex:1, data:paretoData.cumPct,
        lineStyle:{ color:C.gold, width:2 }, itemStyle:{ color:C.gold }, symbol:'circle', symbolSize:5
      },
    ],
  });
}

// ── Render semua chart sekaligus ────────────────────────────
function renderAllCharts(trendData, paretoData) {
  renderMoldhChart(trendData);
  renderRejectChart(trendData);
  renderProdChart(trendData);
  renderEnergyChart(trendData);
  renderParetoChart(paretoData);
}
