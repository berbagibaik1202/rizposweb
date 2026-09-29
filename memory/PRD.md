# RizPOS — Product Requirements

## Original Problem Statement
"Buat aplikasi pos point of sale dengan seluruh dokumentasi yang kamu miliki" — plus user requests: scan barcode di kasir, admin bisa ganti logo/alamat/kontak toko, integrasi Midtrans & Tripay.

## Architecture
- Backend: FastAPI + MongoDB (motor)
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
- Loyalty points untuk pelanggan

## Backlog (P2)
- Print thermal ESC/POS langsung
- Voucher/promo code
- Inventory adjustment audit log
