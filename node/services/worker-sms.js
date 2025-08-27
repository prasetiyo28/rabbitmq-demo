import amqp from 'amqplib';
import { connect, graceful } from '../common/config.js';

(async ()=>{
  const { conn, ch } = await connect(amqp);
  graceful(conn, ch);
  const EX = 'notify.exchange';
  await ch.assertExchange(EX, 'topic', { durable: true });

  await ch.assertQueue('notify.sms', { durable: true });
  await ch.bindQueue('notify.sms', EX, 'notify.sms.*');
  await ch.bindQueue('notify.sms', EX, 'notify.delayed');

  console.log('[SMS] Waiting for notify.sms.* or delayed...');
  ch.consume('notify.sms', (msg)=>{
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    const finalKey = data.delayedKey || msg.fields.routingKey;
    if (finalKey.startsWith('notify.sms.')) {
      console.log(`[SMS] Send to=${data.to} text="${data.message}"`);
    } else {
      console.log('[SMS] Skipped delayed non-sms message');
    }
    ch.ack(msg);
  }, { noAck:false });
})();