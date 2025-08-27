
# 📣 RabbitMQ Notifications (Node.js) — Dari Basic sampai Use Case

Repositori ini membantu kamu belajar RabbitMQ **dari dasar** sampai **penerapan nyata** untuk **sistem notifikasi** (email, SMS, push).  
Teknologi: **RabbitMQ** (message broker, AMQP), **Node.js**, **amqplib**.

---

## 1) Dasar-dasar RabbitMQ

### 1.1 Apa itu RabbitMQ?
**RabbitMQ** adalah *message broker*—perantara pengiriman pesan antar aplikasi/service. Tujuan utamanya:
- **Decoupling**: pengirim (producer) tidak perlu tahu detail penerima (consumer).
- **Reliability**: pesan bisa disimpan, di-ack, di-retry.
- **Scalability**: mudah menambah worker/consumer paralel.

### 1.2 Istilah penting
- **Producer**: pengirim pesan.
- **Queue**: antrean penyimpanan sementara pesan.
- **Consumer**: penerima/pekerja yang memproses pesan dari queue.
- **Exchange**: “router” yang menerima pesan dari producer dan menyalurkannya ke queue sesuai aturan.
- **Binding**: aturan penghubung antara exchange → queue.
- **Routing key**: “alamat”/topik pesan untuk dipakai exchange saat meroute.
- **Ack (acknowledgement)**: tanda “pesan berhasil diproses” dari consumer ke broker.
- **Durable (queue/exchange)**: bertahan saat broker restart.
- **Persistent (message)**: pesan ditulis ke disk agar tidak hilang saat broker restart.
- **DLX / DLQ**: *Dead Letter Exchange/Queue*, tempat pesan “gagal” atau “expired” dikirim.

### 1.3 Jenis-jenis Exchange (ringkas)
- **Direct**: cocok untuk *exact match* routing key.
- **Fanout**: broadcast ke semua queue yang terikat.
- **Topic** (dipakai di repo ini): gunakan pola `a.b.c` + wildcard `*` atau `#`.
- **Headers**: rute berdasar header, bukan routing key.

---

## 2) Arsitektur Notifikasi di Repo Ini

### 2.1 Topologi
- Exchange: `notify.exchange` (type: **topic**)
- Queue:
  - `notify.email`  ← menerima `notify.email.*`
  - `notify.sms`    ← menerima `notify.sms.*`
  - `notify.push`   ← menerima `notify.push.*`
  - `notify.delay`  ← untuk delay/TTL (opsional)
- Producer CLI: `notify-send.js`
- Workers (consumers): `worker-email.js`, `worker-sms.js`, `worker-push.js`

**Skema ASCII**
```
 Producer (notify-send.js)
        |
        v   routing key: notify.<channel>.<type>
   +----------------------+
   |  notify.exchange     |  (topic)
   +----------------------+
     |            |            |
     v            v            v
notify.email   notify.sms   notify.push
```

### 2.2 Pola Routing
- **Key**: `notify.<channel>.<type>`
  - Contoh: `notify.email.registration`, `notify.sms.otp`, `notify.push.order`
- Keuntungan:
  - **Terstruktur**: mudah difilter per channel/jenis.
  - **Extensible**: menambahkan jenis baru cukup dengan key baru, tanpa ubah kode worker.

---

## 3) Setup & Menjalankan

### 3.1 Jalankan RabbitMQ
```bash
docker compose up -d
# UI: http://localhost:15672  (guest / guest)
```

### 3.2 Install dependensi
```bash
cd node
cp .env.example .env
npm install
```

### 3.3 Buat topologi
```bash
node services/setup.js
```

### 3.4 Jalankan workers (3 terminal)
```bash
node services/worker-email.js
node services/worker-sms.js
node services/worker-push.js
```

---

## 4) Use Cases & Perintah Contoh

> Semua contoh dikirim lewat `notify-send.js`.  
> Ganti nilai `--to`, `--subject`, `--message` sesuai kebutuhan.

### 4.1 Email — Verifikasi Akun
- **Tujuan**: kirim email link verifikasi setelah user registrasi.
- **Routing key**: `notify.email.registration`
```bash
node services/notify-send.js   --channel=email --type=registration   --to="user@example.com"   --subject="Verifikasi Akun Kamu"   --message="Klik tautan untuk verifikasi akun."
```

### 4.2 Email — Reset Password
- **Tujuan**: kirim tautan reset password.
- **Routing key**: `notify.email.reset`
```bash
node services/notify-send.js   --channel=email --type=reset   --to="user@example.com"   --subject="Reset Password"   --message="Klik link berikut untuk reset password."
```

### 4.3 SMS — OTP Login
- **Tujuan**: kirim kode OTP ke nomor HP.
- **Routing key**: `notify.sms.otp`
```bash
node services/notify-send.js   --channel=sms --type=otp   --to="+6281234567890"   --message="Kode OTP kamu: 123456"
```

### 4.4 Push — Update Status Pesanan
- **Tujuan**: kirim notifikasi push ke device ID/user ID.
- **Routing key**: `notify.push.order`
```bash
node services/notify-send.js   --channel=push --type=order   --to="user-abc"   --message="Pesanan #123 sedang dikirim."
```

### 4.5 Campaign — Broadcast Promo (Fan-out dengan Topic)
- **Tujuan**: broadcast promo melalui semua channel.
- **Cara**: kirim ke tiga channel berbeda (3 perintah).
```bash
# Email Promo
node services/notify-send.js --channel=email --type=promo   --to="user@example.com" --subject="Promo Akhir Bulan" --message="Diskon 25%!"

# SMS Promo
node services/notify-send.js --channel=sms --type=promo   --to="+6281234567890" --message="Promo 25% berlaku s/d Minggu!"

# Push Promo
node services/notify-send.js --channel=push --type=promo   --to="user-abc" --message="Jangan lewatkan promo 25%!"
```

### 4.6 Reminder Terjadwal (Delay/TTL)
- **Tujuan**: kirim pengingat di masa depan (contoh: 10 detik kemudian).
- **Mekanisme**: kirim ke `notify.delay` (TTL) → setelah TTL, DLX route ke `notify.exchange`.
```bash
node services/notify-send.js   --channel=email --type=reminder   --to="user@example.com"   --subject="Pengingat Pembayaran"   --message="Jangan lupa bayar tagihan."   --delay=10000
```

---

## 5) Konsep Keandalan (Reliability)

### 5.1 Durability & Persistence
- Pastikan **exchange & queue durable**, dan **message persistent** agar aman saat broker restart.
- Di contoh ini: exchange & queues dibuat durable; pesan dari producer dikirim persistent.

### 5.2 Acknowledgement (Ack)
- Workers melakukan `ch.ack(msg)` setelah sukses.
- Jika gagal dan ingin retry otomatis, bisa `nack` dan mengandalkan Redelivery atau pattern **DLQ/TTL**.

### 5.3 DLQ dan TTL untuk Retry/Delay
- **TTL**: pesan “hidup” selama N ms → expired → diarahkan ke DLX (dead-letter exchange).
- **DLQ**: queue tujuan pesan yang expired/gagal → bisa diinspeksi, diproses ulang, atau di-trigger kembali.

> Di repo ini, **delay** memanfaatkan TTL di `notify.delay` yang dead-letter ke `notify.exchange` dengan routing key `notify.delayed`.  
> Worker akan menyaring hanya pesan yang sesuai channel-nya.

### 5.4 Idempotensi
- Saat mengirim notifikasi ulang (retry), pastikan **idempotent** (misalnya, dengan `messageId` atau `idempotencyKey`) untuk mencegah user menerima *double notification*.
- Integrasikan penyimpanan status (DB) jika dibutuhkan.

---

## 6) Ekstensi (Ide Lanjutan)
- **Priority Queue**: notifikasi kritikal (fraud/keamanan) punya prioritas lebih tinggi.
- **Headers Exchange**: routing berdasarkan tenant/region lewat header.
- **Rate Limiting**: batasi throughput per channel/provider.
- **Observability**: metrik per channel (sukses, gagal, latency).
- **Outbox Pattern**: pastikan konsistensi antara DB → pesan (exactly-once di sisi konsumen).

---

## 7) Troubleshooting
- Pesan tidak sampai ke queue:
  - Cek **routing key** dan **binding**; gunakan *pattern* yang benar untuk topic exchange.
- Worker tidak tampil log:
  - Pastikan worker berjalan, tidak ada error koneksi, queue benar, dan ada pesan masuk.
- Delay tidak jalan:
  - Pastikan `--delay` > 0, queue `notify.delay` sudah ada, dan DLX terkonfigurasi (via `setup.js`).
- Port bentrok:
  - Ubah mapping di `docker-compose.yml` (5672 / 15672).

---

## 8) Struktur Direktori
```
rabbitmq-notify-nodejs/
├─ docker-compose.yml
├─ node/
│  ├─ .env.example
│  ├─ package.json
│  ├─ common/
│  │  └─ config.js
│  └─ services/
│     ├─ setup.js
│     ├─ notify-send.js
│     ├─ worker-email.js
│     ├─ worker-sms.js
│     └─ worker-push.js
└─ README.md (file ini)
```

---

## 9) Quick Start (Ringkas)
```bash
docker compose up -d
cd node && cp .env.example .env && npm install
node services/setup.js
node services/worker-email.js
node services/worker-sms.js
node services/worker-push.js
node services/notify-send.js --channel=email --type=registration --to="user@example.com" --subject="Welcome!" --message="Selamat datang!"
```

Selamat belajar dan bereksperimen! 🚀

---

## 🔗 Integrasi SMTP & Mailtrap

Repo ini sudah terintegrasi **SMTP** via **Nodemailer** untuk mengirim email sungguhan. Disarankan memakai **Mailtrap Sandbox** agar aman saat pengujian.

### Langkah Konfigurasi
1. Buat akun di Mailtrap (Sandbox).
2. Catat kredensial SMTP Sandbox (host, port, username, password).
3. Edit `node/.env`:
   ```
   SMTP_HOST=sandbox.smtp.mailtrap.io
   SMTP_PORT=587
   SMTP_USER=<MAILTRAP_USERNAME>
   SMTP_PASS=<MAILTRAP_PASSWORD>
   SMTP_FROM="Notifications <no-reply@example.com>"
   ```
4. Install dependency baru:
   ```bash
   cd node
   npm install
   ```
5. Jalankan worker email:
   ```bash
   node services/worker-email.js
   ```
6. Kirim contoh email:
   ```bash
   node services/notify-send.js --channel=email --type=registration \
     --to="inbox@your-mailtrap.test" \
     --subject="Welcome!" \
     --message="Hi, selamat bergabung."
   ```
7. Buka Mailtrap → Inbox Sandbox → cek email terkirim.

> Catatan:
> - `SMTP_PORT=465` gunakan `secure=true` (otomatis oleh worker).
> - Jika `SMTP_USER/PASS` tidak di-set, worker akan **fallback** hanya log ke console (tidak mengirim).
> - Untuk produksi, gunakan provider SMTP/ESP yang andal dan setup retry/delivery monitoring.
---

## 🌐 Express API Producer + Sequelize (MySQL)

Sekarang repo ini punya **API Express** sebagai producer yang:
1) **Menyimpan** request notifikasi ke MySQL melalui **Sequelize**  
2) **Mempublish** pesan ke RabbitMQ (routing key `notify.<channel>.<type>`)

### Jalankan MySQL + RabbitMQ
```bash
docker compose up -d
# MySQL: 127.0.0.1:3306 (notify/notify123, db=notifydb)
# RabbitMQ UI: http://localhost:15672 (guest/guest)
```

### Konfigurasi ENV (DB + SMTP jika perlu)
Edit `node/.env`:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=notify
DB_PASS=notify123
DB_NAME=notifydb
# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
# SMTP (opsional untuk worker-email)
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=<MAILTRAP_USERNAME>
SMTP_PASS=<MAILTRAP_PASSWORD>
SMTP_FROM="Notifications <no-reply@example.com>"
```

### Start API
```bash
cd node
npm install
node api-server.js
# API: http://localhost:3000
```

### Endpoints
- `GET /health` → cek status
- `POST /api/notifications` → buat & publish notifikasi
- `GET /api/notifications` → list 100 notifikasi terakhir
- `GET /api/notifications/:id` → detail

**Contoh Request**:
```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "type": "registration",
    "to": "inbox@your-mailtrap.test",
    "subject": "Welcome!",
    "message": "Hi, selamat bergabung."
  }'
```

**Respons (contoh)**:
```json
{ "id": "8a9e0f4a-...", "status": "published", "routingKey": "notify.email.registration" }
```

Tips:
- Jalankan workers (email/sms/push) agar pesan benar-benar dikonsumsi.
- Tabel `notifications` dibuat otomatis via `sequelize.sync()`.
- Untuk produksi, gunakan migrasi (umumnya dengan `sequelize-cli`) dan kendalikan `sync`.