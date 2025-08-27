import amqp from 'amqplib';
import { connect, graceful } from '../common/config.js';

(async ()=>{
  const { conn, ch } = await connect(amqp);
  graceful(conn, ch);
  const EX = 'notify.exchange';
  await ch.assertExchange(EX, 'topic', { durable: true });

  await ch.assertQueue('notify.push', { durable: true });
  await ch.bindQueue('notify.push', EX, 'notify.push.*');
  await ch.bindQueue('notify.push', EX, 'notify.delayed');

  console.log('[PUSH] Waiting for notify.push.* or delayed...');
  ch.consume('notify.push', (msg)=>{
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    const finalKey = data.delayedKey || msg.fields.routingKey;
    if (finalKey.startsWith('notify.push.')) {
      console.log(`[PUSH] Send to=${data.to} msg="${data.message}"`);
    } else {
      console.log('[PUSH] Skipped delayed non-push message');
    }
    ch.ack(msg);
  }, { noAck:false });
})();