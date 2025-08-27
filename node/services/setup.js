import amqp from 'amqplib';
import { connect, graceful } from '../common/config.js';

(async ()=>{
  const { conn, ch } = await connect(amqp);
  graceful(conn, ch);

  const EX = 'notify.exchange';
  await ch.assertExchange(EX, 'topic', { durable: true });

  await ch.assertQueue('notify.email', { durable: true });
  await ch.assertQueue('notify.sms',   { durable: true });
  await ch.assertQueue('notify.push',  { durable: true });

  await ch.bindQueue('notify.email', EX, 'notify.email.*');
  await ch.bindQueue('notify.sms',   EX, 'notify.sms.*');
  await ch.bindQueue('notify.push',  EX, 'notify.push.*');

  // Delay infra: a single delay queue -> DLX back to exchange
  await ch.assertQueue('notify.delay', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EX,
      'x-dead-letter-routing-key': 'notify.delayed'
    }
  });

  console.log('Notify topology created.');
  process.exit(0);
})();