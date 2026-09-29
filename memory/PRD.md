# RizPOS — Product Requirements

## Original Problem Statement
"Buat aplikasi pos point of sale dengan seluruh dokumentasi yang kamu miliki" — plus user requests: scan barcode di kasir, admin bisa ganti logo/alamat/kontak toko, integrasi Midtrans & Tripay.

## Architecture
- Backend: FastAPI + MySQL (document compatibility adapter)
- Frontend: React 19 + Tailwind + shadcn + Recharts
- Auth: JWT Bearer (bcrypt), roles: admin / cashier
- Payment gateways: Midtrans (Snap) + Tripay (Sandbox)

## Users
- **Admin (owner)**: full access – products, categories, users, settings toko, reports
- **Cashier**: kasir, transaksi, pelanggan, laporan

## Core Features (implemented)
- Auth (login, JWT, seed admin=nanaperm12@gmail.com, cashier=cashier@rizpos.id)
- Dashboard (KPI hari ini, tren 7 hari, top produk, low stock, split metode bayar)
- Kasir/POS: pencarian, filter kategori, keranjang, diskon, pajak, kembalian
- **Barcode scan** (input manual & hardware scanner via keydown listener) — lookup by SKU/barcode
- Produk (CRUD, SKU, barcode, stok, gambar), Kategori (color picker), Pelanggan
- Transaksi (histori, filter metode, struk digital + print)
- Laporan (rentang tanggal, per kategori, top produk)
- Users management (admin only, aktif/nonaktif)
- **Pengaturan Toko** (admin only) – logo, nama, tagline, alamat, telepon, email, footer struk → tampil di sidebar & struk
- Payment methods: Cash (kembalian & quick cash), Card (simulasi), QRIS (simulasi), **Midtrans Snap**, **Tripay** (QRIS/VA/e-wallet/retail)
- Pembelian supplier dan alur keuangan: invoice supplier, harga beli/HPP, stok masuk, hutang supplier, pemasukan/pengeluaran, saldo awal dan saldo berjalan
- Customer Display: sesi kasir, detail transaksi, pembayaran gateway, slider promosi, warna display, nama kasir dan layout transaksi
- Persistensi draft kasir setelah reload browser

## What's been implemented (2026-02)
- Full end-to-end POS flow
- Barcode scanner support (manual + hardware keystroke buffer)
- Store settings API + UI + reflected on sidebar & receipt
- Midtrans Snap popup (sandbox) + status polling
- Tripay charge + channel picker + QR/checkout URL + auto-poll status
- Seed data: 4 kategori, 9 produk contoh

## Backlog (P1)
- Webhook signature verification for Midtrans/Tripay (production-ready)
- Export laporan (PDF/Excel)
- Multi-store / multi-outlet
- Shift kasir & open/close cash drawer
- **CRM dan promosi pelanggan**
- **Offline transaction dan automatic sync**

## Backlog (P2)
- Print thermal ESC/POS langsung
- Voucher/promo code
- Inventory adjustment audit log

## TODO — CRM dan Promosi Pelanggan

### Data dan aturan bisnis
- [ ] Tambah status member, kode member, dan level pelanggan.
- [ ] Tambah saldo poin dan ledger/riwayat perubahan poin.
- [ ] Buat pengaturan admin untuk nilai perolehan poin dan nilai penukaran poin.
- [ ] Tambah harga khusus member atau pelanggan tertentu.
- [ ] Buat voucher berdasarkan nominal, persentase, minimal belanja, periode berlaku, dan batas pemakaian.
- [ ] Buat promosi berdasarkan produk atau kategori.
- [ ] Simpan snapshot diskon, voucher, harga khusus, dan poin pada transaksi agar histori tidak berubah.

### Halaman admin dan kasir
- [ ] Halaman detail pelanggan: profil, total belanja, poin, voucher, dan riwayat transaksi.
- [ ] Halaman admin untuk membuat, mengubah, menonaktifkan, dan melihat penggunaan voucher.
- [ ] Pilihan pelanggan/member di kasir dengan pencarian kode, nama, atau nomor telepon.
- [ ] Tampilkan harga member dan diskon produk langsung di keranjang.
- [ ] Pilihan penggunaan voucher dan poin sebelum pembayaran.
- [ ] Tampilkan ringkasan penghematan pada struk dan customer display.

### Validasi
- [ ] Poin hanya diberikan setelah transaksi berstatus berhasil/paid.
- [ ] Transaksi dibatalkan/refund mengembalikan atau mengurangi poin sesuai aturan.
- [ ] Voucher tidak dapat dipakai setelah kedaluwarsa atau melewati batas penggunaan.
- [ ] Diskon tidak boleh membuat total transaksi bernilai negatif.

## TODO — Offline Transaction dan Automatic Sync

### Fondasi offline
- [ ] Tambah penyimpanan lokal berbasis IndexedDB untuk draft dan antrean transaksi.
- [ ] Deteksi status koneksi backend secara berkala, bukan hanya status internet browser.
- [ ] Tampilkan indikator Online/Offline dan jumlah transaksi yang menunggu sinkronisasi.
- [ ] Simpan snapshot produk, harga, stok, pelanggan, dan aturan diskon yang digunakan saat offline.

### Transaksi offline
- [ ] Izinkan transaksi offline untuk pembayaran tunai dan kartu.
- [ ] Nonaktifkan gateway online ketika offline dan tampilkan alasannya.
- [ ] Buat client transaction ID/idempotency key agar retry tidak membuat transaksi ganda.
- [ ] Tetap dukung struk lokal setelah transaksi offline selesai.
- [ ] Tandai transaksi sebagai pending_sync sampai diterima backend.

### Sinkronisasi backend
- [ ] Tambah endpoint batch sync dengan autentikasi pengguna.
- [ ] Sinkronkan transaksi secara berurutan dan aman untuk retry.
- [ ] Validasi stok dan harga ketika transaksi diterima backend.
- [ ] Tentukan strategi konflik stok: tolak, tandai perlu review, atau izinkan stok minus sesuai pengaturan admin.
- [ ] Sinkronkan pengurangan stok, omzet, HPP, laba, poin, voucher, dan saldo keuangan secara atomik.
- [ ] Kembalikan hasil per transaksi: synced, duplicate, atau conflict.

### Operasional dan keamanan
- [ ] Halaman antrean sinkronisasi untuk melihat, mencoba ulang, atau membatalkan transaksi gagal.
- [ ] Audit log untuk sinkronisasi dan konflik transaksi.
- [ ] Jangan menyimpan token pembayaran gateway atau data sensitif di antrean offline.
- [ ] Uji skenario reload browser, backend mati, koneksi putus saat submit, retry, dan dua kasir menjual stok yang sama.

### Kriteria selesai
- [ ] Kasir dapat menyelesaikan transaksi tunai saat backend sementara tidak tersedia.
- [ ] Transaksi otomatis masuk backend setelah koneksi pulih tanpa duplikasi.
- [ ] Stok, laporan, keuangan, poin, dan voucher konsisten setelah sinkronisasi.
- [ ] Transaksi gateway tetap menunggu koneksi dan tidak dibuat sebagai transaksi offline.

## TODO — Full Desktop Application

### Arsitektur desktop
- [ ] Bungkus React frontend menggunakan Electron.
- [ ] Jalankan backend FastAPI secara otomatis sebagai proses lokal aplikasi.
- [ ] Aplikasi membuka tampilan POS tanpa pengguna menjalankan browser atau `localhost:3000` secara manual.
- [ ] Backend berhenti dengan aman ketika aplikasi desktop ditutup.
- [ ] Pastikan aplikasi dapat mendeteksi backend lokal yang sedang berjalan dan mencegah proses ganda.

### Database dan mode operasi
- [ ] Tentukan mode database desktop: SQLite lokal untuk satu komputer atau MySQL untuk multi-kasir.
- [ ] Tambah pemeriksaan koneksi dan migrasi database saat aplikasi pertama kali dibuka.
- [ ] Simpan konfigurasi toko, perangkat, dan printer secara lokal dengan aman.
- [ ] Integrasikan mekanisme offline transaction dan automatic sync ke aplikasi desktop.
- [ ] Sediakan opsi backup dan restore database dari menu aplikasi.

### Perangkat kasir
- [ ] Siapkan fondasi printer bridge lokal tanpa ketergantungan QZ Tray.
- [ ] Dukungan printer USB, Bluetooth/COM, dan Wi-Fi/LAN secara bertahap.
- [ ] Tambah halaman pengaturan dan uji printer.
- [ ] Tambah dukungan barcode scanner, cash drawer, dan perangkat kasir lain jika tersedia.

### Build dan distribusi Windows
- [ ] Buat konfigurasi build development dan production.
- [ ] Buat installer Windows (`.exe`).
- [ ] Sertakan runtime backend dan dependency yang dibutuhkan ke dalam installer.
- [ ] Buat shortcut desktop dan Start Menu.
- [ ] Tambah mekanisme update versi aplikasi.
- [ ] Tampilkan halaman troubleshooting ketika backend, database, atau perangkat gagal dijalankan.

### Keamanan dan pengujian
- [ ] Pisahkan konfigurasi development dan production.
- [ ] Jangan menampilkan secret payment gateway di frontend desktop.
- [ ] Uji instalasi baru, upgrade versi, uninstall, backup, restore, dan rollback.
- [ ] Uji aplikasi tanpa internet, backend gagal start, database terkunci, dan koneksi printer terputus.
- [ ] Uji satu komputer kasir dan skenario beberapa kasir yang terhubung ke MySQL.

### Kriteria selesai
- [ ] Pengguna dapat menginstal RizPOS melalui satu installer Windows.
- [ ] Aplikasi dapat dibuka dari shortcut dan langsung menampilkan halaman login.
- [ ] Backend dan database berjalan sesuai mode yang dipilih tanpa perintah terminal manual.
- [ ] Transaksi kasir, customer display, laporan, keuangan, dan backup berjalan dari aplikasi desktop.
- [ ] Aplikasi tetap dapat melakukan transaksi tunai saat internet tidak tersedia.
