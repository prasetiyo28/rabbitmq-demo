// Import library amqplib untuk koneksi RabbitMQ
import amqp from 'amqplib';
// Import fungsi connect dan graceful shutdown
import { connect, graceful } from '../common/config.js';

// Fungsi utama setup (IIFE)
(async ()=>{
  // Membuka koneksi dan channel ke RabbitMQ
  const { conn, ch } = await connect(amqp);
  // Setup graceful shutdown
  graceful(conn, ch);

  // Nama exchange utama
  const EX = 'notify.exchange';
  // Membuat exchange bertipe topic dan durable
  await ch.assertExchange(EX, 'topic', { durable: true });

  // Membuat queue untuk email, sms, dan push notification
  await ch.assertQueue('notify.email', { durable: true });
  await ch.assertQueue('notify.sms',   { durable: true });
  await ch.assertQueue('notify.push',  { durable: true });

  // Menghubungkan queue ke exchange dengan routing key masing-masing
  await ch.bindQueue('notify.email', EX, 'notify.email.*');
  await ch.bindQueue('notify.sms',   EX, 'notify.sms.*');
  await ch.bindQueue('notify.push',  EX, 'notify.push.*');

  // Membuat delay queue dengan dead-letter exchange ke EX
  // Pesan yang kadaluarsa di delay queue akan dikirim ke EX dengan routing key 'notify.delayed'
  await ch.assertQueue('notify.delay', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EX,
      'x-dead-letter-routing-key': 'notify.delayed'
    }
  });

  // Menampilkan pesan bahwa topologi sudah dibuat
  console.log('Notify topology created.');
  // Mengakhiri proses Node.js
  process.exit(0);
})();