import amqp from 'amqplib';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { v4 as uuidv4 } from 'uuid';
import { connect } from '../common/config.js';

const argv = yargs(hideBin(process.argv))
  .option('channel', { type:'string', choices:['email','sms','push'], demandOption:true })
  .option('type', { type:'string', default:'generic' })
  .option('to', { type:'string', demandOption:true })
  .option('subject', { type:'string', default:'' })
  .option('message', { type:'string', default:'' })
  .option('delay', { type:'number', default:0, describe:'Delay in ms before delivering' })
  .help().parse();

(async ()=>{
  const { conn, ch } = await connect(amqp);
  const EX = 'notify.exchange';
  await ch.assertExchange(EX, 'topic', { durable: true });

  const payload = {
    id: uuidv4(),
    to: argv.to,
    subject: argv.subject,
    message: argv.message,
    channel: argv.channel,
    type: argv.type,
    ts: new Date().toISOString()
  };
  const key = `notify.${argv.channel}.${argv.type}`;

  if (argv.delay > 0) {
    // Send to delay queue with per-message TTL, then DLX routes to EX with key notify.delayed
    await ch.assertQueue('notify.delay', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EX, 'x-dead-letter-routing-key': 'notify.delayed' }
    });
    ch.sendToQueue('notify.delay', Buffer.from(JSON.stringify({ ...payload, delayedKey: key })), {
      persistent: true,
      contentType: 'application/json',
      expiration: String(argv.delay),
      messageId: payload.id
    });
    console.log(`[SEND] Scheduled ${key} in ${argv.delay}ms ->`, payload);
  } else {
    ch.publish(EX, key, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: payload.id
    });
    console.log('[SEND] Published', key, '->', payload);
  }
  await ch.close(); await conn.close();
  process.exit(0);
})();