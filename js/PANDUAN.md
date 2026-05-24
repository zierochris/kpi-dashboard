# 📊 PANDUAN PENGGUNAAN — KPI Dashboard Iron Foundry FY2026

> Panduan singkat untuk operator, supervisor, dan manajemen.

---

## 🔗 Akses Dashboard

| Platform | URL |
|---|---|
| **Web / Laptop** | `https://USERNAME.github.io/kpi-dashboard` |
| **HP Android/iPhone** | Buka URL yang sama di Chrome/Safari |
| **Bookmark** | Tambahkan ke Home Screen HP untuk akses cepat |

---

## 📱 TAB NAVIGASI

Dashboard punya 3 tab utama:

| Tab | Fungsi | Pengguna |
|---|---|---|
| 📊 **Dashboard** | Lihat scorecard & chart KPI | Manager, BOD |
| ✏️ **Input Harian** | Isi data produksi harian | Operator, Supervisor |
| 📋 **Riwayat** | Lihat & filter histori input | Semua |

---

## ✏️ CARA INPUT DATA HARIAN

### Langkah-langkah:

1. Buka dashboard → klik tab **✏️ Input Harian**
2. Isi **Tanggal** dan **Shift** (wajib)
3. Isi nama/kode operator (opsional tapi dianjurkan)
4. Isi data produksi **ACE-1** dan **ACE-2**:
   - **Mold/Hour actual** — angka mold yang dihasilkan per jam
   - **Output (Mold)** — total mold yang keluar shift ini
   - **Loss Time %** — isi 0 jika tidak ada loss (BDT, PourWait, Loss Mold, Other)
   - **Reject (pcs)** — jumlah mold yang direject
   - Reject% dan Prod% **dihitung otomatis** — tidak perlu diisi manual
5. Isi **Finishing** dan **Core** Prod% (0–100)
6. Safety — pilih "Tidak ada" atau "Ada insiden" (jika ada, isi kategori & deskripsi)
7. Isi data **Gentani** (Electrical Furnace & Non-Furnace kWH hari ini)
8. Tambahkan **Catatan** jika ada info penting (opsional)
9. Klik **👁️ Preview** untuk cek sebelum submit
10. Klik **✓ Submit Data**

### Tips:
- Data **auto-tersimpan sebagai draft** setiap 20 detik — aman jika browser tidak sengaja ditutup
- Setelah submit berhasil, dashboard otomatis refresh saat dibuka kembali
- Jika jaringan bermasalah saat submit, data disimpan sebagai draft lokal

---

## 📊 CARA BACA DASHBOARD

### Periode
Pilih periode di tombol atas: **Hari Ini | 7 Hari | Bulan Ini | YTD FY26**

Catatan YTD: dihitung dari **1 April 2026** (awal Fiscal Year 2026)

### Scorecard KPI
Setiap kartu menampilkan:
- **Angka aktual** (besar, berwarna)
- Target FY2026
- Status RAG:
  - 🟢 **✓ On Target** — aktual memenuhi target
  - 🟡 **~ Near Miss** — dalam 5% dari target
  - 🔴 **✗ Below Target** — lebih dari 5% di bawah target
  - ⬜ **— No Data** — belum ada data untuk periode ini

### Completeness Badge
Badge `📋 15 shift | 83% lengkap` menunjukkan berapa banyak data yang sudah diisi vs yang diharapkan (target 3 shift/hari).

---

## 📋 CARA PAKAI RIWAYAT

- **Filter tanggal** — isi "Dari" dan "Sampai" lalu klik 🔍 Filter
- **Filter shift** — pilih Shift 1/2/3 atau "Semua Shift"
- **Cari operator** — ketik nama operator
- **Klik header kolom** untuk sort naik/turun
- **⬇️ CSV** — download data sebagai file Excel-compatible

---

## 🖨️ PRINT / EXPORT PDF (untuk BOD)

1. Buka tab **Dashboard**
2. Pilih periode yang ingin dicetak (misal: YTD FY26)
3. Tunggu data ter-load
4. Klik tombol **🖨️ Print** di header atas
5. Dialog print browser akan muncul
6. Pilih **"Save as PDF"** untuk simpan sebagai file, atau pilih printer
7. Layout otomatis A4 Landscape dengan scorecard lengkap dan kolom tanda tangan

---

## ⚙️ CARA UPDATE TARGET KPI

Target KPI tersimpan di Google Sheets — tidak perlu edit kode.

1. Buka **Google Sheets** → tab **KPI_TARGETS**
2. Cari KPI yang ingin diubah di kolom `kpi_id`
3. Ubah nilai di kolom `target`
4. Simpan (otomatis)
5. Klik **Refresh** di dashboard — target baru langsung berlaku

---

## 📅 CARA INPUT DATA BULANAN (Manhour, Steelshot, dll)

Data bulanan diisi manual di Google Sheets:

1. Buka Google Sheets → tab **MONTHLY_SUMMARY**
2. Tambahkan baris baru di bawah header terakhir
3. Isi kolom:
   - `year_month` — format `2026-04` (April 2026)
   - `steelshot_kg_ton` — konsumsi steelshot
   - `bentonite_kg_ton` — konsumsi bentonite
   - `manhour_molding` — manhour per mold (Man.Min/Mold)
   - `manhour_finishing` — manhour finishing
   - `total_output_ton` — total ton produksi bulan ini
4. Simpan → refresh dashboard → Manhour akan muncul di scorecard

---

## 🛡️ KEAMANAN DATA

- Dashboard **hanya bisa baca** data tanpa operator code
- Form submit membutuhkan **operator code**: `FOUNDRY2026`
- Operator code bisa diganti di Google Sheets tab **CONFIG** (baris `operator_secret`)
- Setelah ganti kode di Sheets, update juga di file `config.js` baris `OPERATOR_SECRET`

---

## 🔧 TROUBLESHOOTING

| Masalah | Solusi |
|---|---|
| "Gagal memuat data" | Pastikan Google Sheets sudah di-share publik (Anyone with link → Viewer) |
| Scorecard semua "No Data" | Pilih periode lain (misal YTD) atau isi data dulu via Input Harian |
| Submit form gagal | Cek koneksi internet. Data tersimpan sebagai draft otomatis |
| Chart tidak tampil | Klik Refresh. Jika masih kosong, baru ada data setelah beberapa hari input |
| Manhour selalu "—" | Isi tab MONTHLY_SUMMARY di Google Sheets dengan data bulan berjalan |
| Pareto Rejection kosong | Isi tab REJECTION_DETAIL di Google Sheets (kolom `defect_category` wajib diisi) |
| Dashboard lambat load | Normal — fetch 3 sumber data sekaligus. Tunggu maks 5 detik |

---

## 📞 KONTAK TEKNIS

Untuk pertanyaan teknis atau request fitur tambahan, hubungi:

- **Email**: _(isi email PIC teknis)_
- **WhatsApp**: _(isi nomor PIC teknis)_

---

*Dokumen ini berlaku untuk KPI Dashboard v3 (Phase 5.4) — Iron Foundry FY2026*
*Terakhir diperbarui: Mei 2026*
