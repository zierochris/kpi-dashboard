// ============================================================
// config.js — Konfigurasi utama KPI Dashboard
// EDIT 3 baris pertama sesuai setup Anda
// ============================================================

const CONFIG = {
  // ⚠️ WAJIB DIISI — Web App URL dari Apps Script (Step B)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwrALaM9xueGEDDvqmrOpGFyVFc2KbJT8aLkSKtOFcCzIndl0IvCnlBgS4EKI0ElKlIgg/exec',

  // ⚠️ WAJIB DIISI — Sheet ID dari URL Google Sheets
  SHEET_ID: '1ENag8XOGKy8eWNtjaUMENZiqAFGy-INc9-D-fk2yg6A',

  // Kode rahasia yang sama dengan tab CONFIG di Sheets
  OPERATOR_SECRET: 'FOUNDRY2026',

  // Nama perusahaan di header dashboard
  COMPANY_NAME: 'Iron Foundry',

  // FY mulai April (bulan 4)
  FY_START_MONTH: 4,
  FY_LABEL: 'FY2026',

  // Threshold RAG status
  NEAR_MISS_PCT: 0.05,   // 5%  = amber
  CRITICAL_PCT:  0.10,   // 10% = red

  // Auto-refresh data setiap N menit (0 = nonaktif)
  AUTO_REFRESH_MINUTES: 10,
};

// ============================================================
// KPI Definitions — 12 KPI utama
// Urutan ini menentukan urutan tampil di scorecard
// ============================================================
const KPI_DEFS = [
  { id:'ace1_moldh',      cat:'ACE-1',    label:'Mold/Hour',       col:'ace1_moldh',        target:148.5, unit:'Mold/H',       fmt:'num1',  lib:false },
  { id:'ace1_prod',       cat:'ACE-1',    label:'Productivity',    col:'ace1_prod_pct',     target:0.97,  unit:'%',            fmt:'pct0',  lib:false },
  { id:'ace1_reject',     cat:'ACE-1',    label:'Rejection Rate',  col:'reject_ace1_pcs',   target:0.019, unit:'%',            fmt:'pct2',  lib:true  },
  { id:'ace2_moldh',      cat:'ACE-2',    label:'Mold/Hour',       col:'ace2_moldh',        target:148.5, unit:'Mold/H',       fmt:'num1',  lib:false },
  { id:'ace2_prod',       cat:'ACE-2',    label:'Productivity',    col:'ace2_prod_pct',     target:0.97,  unit:'%',            fmt:'pct0',  lib:false },
  { id:'ace2_reject',     cat:'ACE-2',    label:'Rejection Rate',  col:'reject_ace2_pcs',   target:0.019, unit:'%',            fmt:'pct2',  lib:true  },
  { id:'finishing_prod',  cat:'Finishing',label:'Productivity',    col:'finishing_prod_pct',target:0.94,  unit:'%',            fmt:'pct0',  lib:false },
  { id:'core_prod',       cat:'Core',     label:'Productivity',    col:'core_prod_pct',     target:0.97,  unit:'%',            fmt:'pct0',  lib:false },
  { id:'furnace_kwh',     cat:'Gentani',  label:'Elec Furnace',    col:'elec_furnace_kwh',  target:550,   unit:'kWH/T',        fmt:'num1',  lib:true  },
  { id:'nonfurnace_kwh',  cat:'Gentani',  label:'Non-Furnace',     col:'elec_nonfurnace_kwh',target:200,  unit:'kWH/T',        fmt:'num1',  lib:true  },
  { id:'manhour_molding', cat:'Manhour',  label:'Molding MH',      col:'manhour_molding',   target:14.2,  unit:'Man.Min/Mold', fmt:'num1',  lib:true  },
  { id:'safety_incident', cat:'Safety',   label:'Incidents',       col:'safety_incident',   target:0,     unit:'Cases',        fmt:'int',   lib:true  },
];

// Bulan FY2026 (Apr-26 → Mar-27)
const MONTHS_FY = [
  'Apr-26','May-26','Jun-26','Jul-26','Aug-26','Sep-26',
  'Oct-26','Nov-26','Dec-26','Jan-27','Feb-27','Mar-27'
];
