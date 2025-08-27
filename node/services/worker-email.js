// Import library amqplib untuk koneksi RabbitMQ
import amqp from 'amqplib';
// Import nodemailer untuk mengirim email
import nodemailer from 'nodemailer';
// Import fungsi connect dan graceful shutdown
import { connect, graceful } from '../common/config.js';

// Mengambil konfigurasi SMTP dari environment variable
const {
  SMTP_HOST = 'sandbox.smtp.mailtrap.io', // Host SMTP default
  SMTP_PORT = '587',                      // Port SMTP default
  SMTP_USER,                              // Username SMTP
  SMTP_PASS,                              // Password SMTP
  SMTP_FROM = 'Notifications <no-reply@example.com>' // Email pengirim default
} = process.env;

// Membuat transport email jika SMTP_USER dan SMTP_PASS tersedia
function makeTransport() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[EMAIL] SMTP_USER/SMTP_PASS not set. Using console fallback.');
    return null; // Jika tidak ada, fallback ke console
  }
  const portNum = Number(SMTP_PORT);
  const secure = portNum === 465; // true jika port 465 (SSL), selain itu false
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: portNum,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

// Fungsi utama worker (IIFE)
(async ()=>{
  // Membuka koneksi dan channel ke RabbitMQ
  const { conn, ch } = await connect(amqp);
  // Setup graceful shutdown
  graceful(conn, ch);

  // Nama exchange utama
  const EX = 'notify.exchange';
  // Pastikan exchange dan queue sudah ada
  await ch.assertExchange(EX, 'topic', { durable: true });
  await ch.assertQueue('notify.email', { durable: true });
  await ch.bindQueue('notify.email', EX, 'notify.email.*');
  await ch.bindQueue('notify.email', EX, 'notify.delayed');

  // Membuat transport email
  const transport = makeTransport();
  console.log('[EMAIL] Worker ready. SMTP host=%s port=%s from=%s', SMTP_HOST, SMTP_PORT, SMTP_FROM);

  // Mulai konsumsi pesan dari queue 'notify.email'
  ch.consume('notify.email', async (msg)=>{
    if (!msg) return; // Jika tidak ada pesan, keluar
    const data = JSON.parse(msg.content.toString()); // Parse payload
    const finalKey = data.delayedKey || msg.fields.routingKey; // Routing key final

    // Hanya proses pesan dengan channel email
    if (!finalKey.startsWith('notify.email.')) {
      console.log('[EMAIL] Skipped non-email message');
      ch.ack(msg); // Langsung ack jika bukan email
      return;
    }

    const subject = data.subject || 'Notification'; // Subjek email
    const to = data.to;                             // Tujuan email
    const text = data.message || '';                // Isi pesan plain text
    const html = `<p>${text.replace(/</g, '&lt;')}</p>`; // Isi pesan HTML

    try {
      if (transport) {
        // Kirim email via SMTP
        const info = await transport.sendMail({
          from: SMTP_FROM,
          to,
          subject,
          text,
          html
        });
        console.log('[EMAIL] Sent via SMTP → to=%s subject="%s" messageId=%s', to, subject, info.messageId);
      } else {
        // Jika tidak ada SMTP, tampilkan di console
        console.log('[EMAIL:FALLBACK] to=%s subject="%s" text="%s"', to, subject, text);
      }
      ch.ack(msg); // Pesan berhasil diproses
    } catch (err) {
      console.error('[EMAIL] SMTP error ->', err.message);
      // Jika gagal, nack dan requeue untuk dicoba ulang
      ch.nack(msg, false, true);
    }
  }, { noAck:false }); // noAck:false agar bisa ack/nack manual
})();