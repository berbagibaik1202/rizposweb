# RizPOS

RizPOS adalah aplikasi Point of Sale berbasis React dan FastAPI dengan MySQL sebagai database.

Dokumentasi lengkap setup sampai build tersedia di [docs/SETUP.md](docs/SETUP.md).

## Ringkasan cepat

```powershell
cd frontend
npm install
npm start
```

Untuk production:

```powershell
cd frontend
npm run build
```

Backend menyimpan data pada MySQL melalui adapter dokumen sementara agar endpoint yang ada tetap kompatibel.
