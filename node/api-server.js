// Import library Express untuk membuat REST API
import express from 'express';
// Import middleware CORS agar API bisa diakses dari domain lain
import cors from 'cors';
// Import middleware logging HTTP request
import morgan from 'morgan';
// Import library validasi schema data
import Joi from 'joi';
// Import library untuk koneksi RabbitMQ
import amqp from 'amqplib';
// Import fungsi connect untuk RabbitMQ dari config.js
import { connect as amqpConnect } from './common/config.js';
// Import instance Sequelize dan model Notification
import { sequelize, Notification } from './common/db.js';

// Membuat instance aplikasi Express
const app = express();
// Mengaktifkan CORS
app.use(cors());
// Mengaktifkan parsing JSON pada body request
app.use(express.json());
// Mengaktifkan logging request HTTP
app.use(morgan('dev'));

// Mendefinisikan schema validasi untuk payload notifikasi
const schema = Joi.object({
  channel: Joi.string().valid('email','sms','push').required(),
  type: Joi.string().max(64).required(),
  to: Joi.string().max(255).required(),
  subject: Joi.string().max(255).allow(''),
  message: Joi.string().allow('')
});

// Mendefinisikan nama exchange RabbitMQ
const EX = 'notify.exchange';

// Fungsi untuk memastikan exchange sudah ada di RabbitMQ
async function ensureAMQP(ch) {
  await ch.assertExchange(EX, 'topic', { durable: true });
}

// Endpoint health check, mengembalikan status OK
app.get('/health', (req,res)=> res.json({ ok: true }));

// Endpoint untuk membuat notifikasi baru
app.post('/api/notifications', async (req, res) => {
  // Validasi payload request
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  // Jika validasi gagal, kembalikan error 400
  if (error) return res.status(400).json({ message: 'Invalid payload', details: error.details });

  // Membuka transaksi database
  const t = await sequelize.transaction();
  try {
    // Simpan notifikasi ke database dengan status 'pending'
    const notif = await Notification.create({
      channel: value.channel,
      type: value.type,
      to: value.to,
      subject: value.subject || '',
      message: value.message || '',
      status: 'pending'
    }, { transaction: t });

    // Publish ke RabbitMQ
    const { conn, ch } = await amqpConnect(amqp);
    await ensureAMQP(ch);
    // Routing key untuk exchange
    const key = `notify.${notif.channel}.${notif.type}`;
    // Payload yang akan dikirim ke RabbitMQ
    const payload = {
      id: notif.id,
      to: notif.to,
      subject: notif.subject,
      message: notif.message,
      channel: notif.channel,
      type: notif.type,
      ts: new Date().toISOString()
    };
    // Publish pesan ke RabbitMQ
    ch.publish(EX, key, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: notif.id
    });
    // Tutup koneksi RabbitMQ
    await ch.close(); await conn.close();

    // Update status notifikasi menjadi 'published'
    notif.status = 'published';
    await notif.save({ transaction: t });

    // Commit transaksi database
    await t.commit();
    // Kembalikan response sukses
    res.status(201).json({ id: notif.id, status: notif.status, routingKey: key });
  } catch (e) {
    // Rollback transaksi jika error
    await t.rollback();
    console.error('Publish error:', e);
    // Kembalikan error 500 jika gagal
    res.status(500).json({ message: 'Failed to publish', error: e.message });
  }
});

// Endpoint untuk mengambil daftar notifikasi
app.get('/api/notifications', async (req, res) => {
  const list = await Notification.findAll({ order: [['created_at','DESC']], limit: 100 });
  res.json(list);
});

// Endpoint untuk mengambil detail notifikasi berdasarkan id
app.get('/api/notifications/:id', async (req, res) => {
  const one = await Notification.findByPk(req.params.id);
  if (!one) return res.status(404).json({ message: 'Not found' });
  res.json(one);
});

// Mendefinisikan port aplikasi
const PORT = process.env.PORT || 3000;

// Fungsi utama untuk menjalankan server
(async ()=>{
  // Tes koneksi ke database
  await sequelize.authenticate();
  // Sinkronisasi model ke database (buat tabel jika belum ada)
  await sequelize.sync(); // auto create table if not exists
  // Menjalankan server Express
  app.listen(PORT, ()=> console.log(`API server running at http://localhost:${PORT}`));
})();