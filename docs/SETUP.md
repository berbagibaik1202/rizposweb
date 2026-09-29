# Dokumentasi Setup dan Build RizPOS

Dokumen ini menjelaskan cara menyiapkan RizPOS dari workspace baru sampai menghasilkan build production.

## 1. Arsitektur proyek

- `frontend/`: React 19, React Router, Tailwind CSS, shadcn/ui, Recharts, dan Axios.
- `backend/`: FastAPI dengan MySQL melalui adapter async. Entry point adalah `backend/server.py` dengan objek aplikasi `app`.
- Payment gateway: Midtrans Snap dan Tripay.
- Autentikasi: JWT Bearer dengan role `admin` dan `cashier`.

## 2. Prasyarat

Install perangkat berikut:

- Node.js LTS, disarankan Node.js 20 atau lebih baru.
- npm atau Yarn 1.x.
- Python 3.11 atau lebih baru untuk backend.
- MySQL atau MariaDB lokal, dengan port `3306`.
- Git, jika source dikelola melalui repository.

Periksa instalasi:

```powershell
node --version
npm --version
python --version
mysql --version
```

## 3. Konfigurasi environment

### Frontend

Buat file `frontend/.env`:

```dotenv
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
WDS_SOCKET_PORT=3000
ENABLE_HEALTH_CHECK=false
```

`REACT_APP_BACKEND_URL` harus menunjuk ke alamat backend tanpa akhiran `/api`, karena frontend menambahkan `/api` melalui `src/lib/api.js`.

### Backend

Buat file `backend/.env` dan isi sesuai environment. Jangan commit file ini karena berisi credential dan secret.

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=rizposweb
JWT_SECRET=ganti-dengan-secret-random-yang-panjang

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ganti-password-admin
CASHIER_EMAIL=kasir@example.com
CASHIER_PASSWORD=ganti-password-kasir

MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_MODE=sandbox

TRIPAY_API_KEY=
TRIPAY_PRIVATE_KEY=
TRIPAY_MERCHANT_CODE=
TRIPAY_MODE=sandbox
# URL HTTPS publik ke endpoint callback backend, contoh:
# TRIPAY_CALLBACK_URL=https://domain-anda.example/api/payments/tripay/callback
TRIPAY_CALLBACK_URL=
```

Gunakan credential sandbox untuk development dan credential production hanya pada environment production.

## 4. Menyiapkan MySQL

Pastikan MySQL/MariaDB berjalan dan port `3306` dapat diakses. Buat database jika belum ada:

Contoh koneksi lokal:

```text
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS rizposweb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Tabel `rizpos_documents` dibuat otomatis oleh migrasi. Data aplikasi disimpan sebagai dokumen JSON dengan collection logis agar migrasi sementara ini kompatibel dengan endpoint lama.

## 5. Menyiapkan backend

Masuk ke folder backend dan buat virtual environment:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Install dependency runtime dari file dependency project:

```powershell
pip install -r requirements.txt
```

Backend hanya menggunakan dependency yang tercantum di `requirements.txt`.

Cara yang disarankan di Windows adalah menjalankan script setup dari folder
`backend`, sehingga Python global tidak digunakan:

```powershell
cd backend
.\setup.ps1
```

Dependency lint/test opsional tersedia di `requirements-dev.txt`:

```powershell
python -m pip install -r requirements-dev.txt
```

### Migrasi database

Jalankan migrasi sebelum backend dijalankan:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe migrate.py
```

Migrasi bersifat idempotent, sehingga aman dijalankan berulang kali. Migrasi akan:

- membuat collection aplikasi jika belum ada;
- membuat index email, SKU, barcode, transaksi, session display, dan lainnya;
- membuat pengaturan toko default jika belum ada;
- menyiapkan metode pembayaran tunai default;
- menyiapkan warna default halaman customer;
- mencatat versi schema pada collection `schema_migrations`.

Migrasi tidak menghapus data dan tidak menimpa pengaturan toko yang sudah ada.

Jalankan FastAPI:

```powershell
.\.venv\Scripts\python.exe -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Verifikasi backend pada `http://localhost:8000/docs`.

Source backend dan `requirements.txt` sudah tersedia di workspace ini.

Pada backend yang sudah memiliki lifecycle startup, panggil migrasi sebelum menerima request. Tetap jalankan migrasi manual pada deployment pertama:

```python
from migrate import run_migrations

@app.on_event("startup")
async def startup():
    await run_migrations(db)
```

Jika memakai lifespan FastAPI, panggil `await run_migrations(db)` di bagian startup lifespan. Perintah manualnya adalah ` .\\.venv\\Scripts\\python.exe migrate.py` dari folder `backend`.

## 6. Menyiapkan frontend

Di terminal baru:

```powershell
cd frontend
npm install
npm start
```

Buka `http://localhost:3000`. Frontend memanggil backend melalui `${REACT_APP_BACKEND_URL}/api`.

## 7. Build production

Jalankan dari folder `frontend`:

```powershell
npm run build
```

Hasil build berada di `frontend/build/`. Deploy folder ini ke Nginx, Apache, CDN, atau static hosting.

Karena aplikasi memakai client-side routing, web server harus mengarahkan route yang tidak ditemukan ke `index.html`.

Contoh Nginx:

```nginx
server {
    listen 80;
    server_name pos.example.com;

    root /var/www/rizpos/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Untuk production, ubah `frontend/.env` agar `REACT_APP_BACKEND_URL` menunjuk ke backend production, misalnya `https://api.example.com`, lalu jalankan build ulang.

## 8. Urutan menjalankan project lokal

Terminal backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m uvicorn server:app --reload --port 8000
```

Terminal frontend:

```powershell
cd frontend
npm start
```

Checklist dasar:

1. MySQL aktif.
2. Backend dapat dibuka di `http://localhost:8000/docs`.
3. Frontend dapat dibuka di `http://localhost:3000`.
4. Login berhasil.
5. Produk dapat dimuat.
6. Transaksi cash dapat dibuat.
7. Customer Display dapat dibuka dari halaman kasir.
8. Payment gateway diuji dalam mode sandbox.

## 9. Struktur fitur penting

- `frontend/src/App.js`: routing aplikasi.
- `frontend/src/pages/Cashier.jsx`: kasir, keranjang, transaksi, dan customer display.
- `frontend/src/pages/CustomerDisplay.jsx`: layar customer dan pembayaran publik.
- `frontend/src/pages/Settings.jsx`: identitas toko, desain struk, provider/metode pembayaran, dan warna customer.
- `frontend/src/context/StoreContext.jsx`: state pengaturan toko.
- `frontend/src/lib/api.js`: konfigurasi Axios dan base URL API.
- `frontend/src/components/Receipt.jsx`: tampilan struk.

## 10. Troubleshooting

### `craco is not recognized`

Dependency frontend belum lengkap. Jalankan:

```powershell
cd frontend
npm install
npm run build
```

### Request API menghasilkan 404 atau 502

Periksa backend, `REACT_APP_BACKEND_URL`, prefix `/api`, CORS, dan konfigurasi reverse proxy.

### Refresh halaman menghasilkan 404 setelah deploy

Tambahkan fallback server ke `index.html` seperti contoh Nginx di atas.

### Payment gateway gagal

Untuk validasi otomatis setelah QRIS dibayar, daftarkan callback Tripay ke:

```text
POST https://domain-anda.example/api/payments/tripay/callback
```

Isi `TRIPAY_CALLBACK_URL` dengan URL HTTPS publik tersebut. `localhost` tidak dapat dipanggil oleh server Tripay; gunakan domain publik atau tunnel HTTPS saat development. Callback harus memakai event `payment_status`. Backend memvalidasi `X-Callback-Signature`, mencocokkan `reference`/`merchant_ref`, lalu mengubah sesi display menjadi `paid`.

Periksa credential sandbox, mode gateway, callback URL, webhook, dan log backend. Jangan memakai credential production di environment development.

### Build gagal karena dependency rusak

Jalankan penghapusan hanya pada dependency frontend, kemudian install ulang:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
npm install
npm run build
```

## 11. Checklist sebelum production

- Backend source dan dependency tersedia.
- MySQL production dan backup sudah disiapkan.
- `JWT_SECRET` diganti dengan secret random baru.
- Credential Midtrans/Tripay production sudah benar.
- CORS dibatasi ke domain resmi.
- HTTPS aktif.
- Webhook payment gateway sudah diverifikasi.
- `npm run build` berhasil.
- Folder `frontend/build` sudah diuji melalui web server.
- Akun default dan password seed sudah diganti.
- File `.env` tidak masuk repository.
