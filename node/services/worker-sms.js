// Import library amqplib untuk koneksi RabbitMQ
import amqp from 'amqplib';
// Import fungsi connect dan graceful shutdown
import { connect, graceful } from '../common/config.js';

(async ()=>{
  // Membuka koneksi dan channel ke RabbitMQ
  const { conn, ch } = await connect(amqp);
  // Setup graceful shutdown
  graceful(conn, ch);
  // Nama exchange utama
  const EX = 'notify.exchange';
  // Membuat exchange bertipe topic dan durable
  await ch.assertExchange(EX, 'topic', { durable: true });

  // Membuat queue untuk SMS dan menghubungkan ke exchange
  await ch.assertQueue('notify.sms', { durable: true });
  await ch.bindQueue('notify.sms', EX, 'notify.sms.*'); // Binding untuk pesan SMS
  await ch.bindQueue('notify.sms', EX, 'notify.delayed'); // Binding untuk pesan delay

  // Log bahwa worker siap menerima pesan
  console.log('[SMS] Waiting for notify.sms.* or delayed...');
  // Mulai konsumsi pesan dari queue 'notify.sms'
  ch.consume('notify.sms', (msg)=>{
    if (!msg) return; // Jika tidak ada pesan, keluar
    const data = JSON.parse(msg.content.toString()); // Parse payload
    const finalKey = data.delayedKey || msg.fields.routingKey; // Routing key final
    if (finalKey.startsWith('notify.sms.')) {
      // Jika pesan untuk SMS, tampilkan log pengiriman
      console.log(`[SMS] Send to=${data.to} text="${data.message}"`);
    } else {
      // Jika bukan pesan SMS, skip
      console.log('[SMS] Skipped delayed non-sms message');
    }
    ch.ack(msg); // Ack pesan agar dihapus dari queue
  }, { noAck:false }); // noAck:false agar bisa ack manual
})();