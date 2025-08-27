import amqp from 'amqplib';
import nodemailer from 'nodemailer';
import { connect, graceful } from '../common/config.js';

const {
  SMTP_HOST = 'sandbox.smtp.mailtrap.io',
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM = 'Notifications <no-reply@example.com>'
} = process.env;

function makeTransport() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[EMAIL] SMTP_USER/SMTP_PASS not set. Using console fallback.');
    return null;
  }
  const portNum = Number(SMTP_PORT);
  const secure = portNum === 465; // true for 465, false for 587/2525
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: portNum,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

(async ()=>{
  const { conn, ch } = await connect(amqp);
  graceful(conn, ch);

  const EX = 'notify.exchange';
  await ch.assertExchange(EX, 'topic', { durable: true });
  await ch.assertQueue('notify.email', { durable: true });
  await ch.bindQueue('notify.email', EX, 'notify.email.*');
  await ch.bindQueue('notify.email', EX, 'notify.delayed');

  const transport = makeTransport();
  console.log('[EMAIL] Worker ready. SMTP host=%s port=%s from=%s', SMTP_HOST, SMTP_PORT, SMTP_FROM);

  ch.consume('notify.email', async (msg)=>{
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    const finalKey = data.delayedKey || msg.fields.routingKey;

    // Only handle email channel
    if (!finalKey.startsWith('notify.email.')) {
      console.log('[EMAIL] Skipped non-email message');
      ch.ack(msg);
      return;
    }

    const subject = data.subject || 'Notification';
    const to = data.to;
    const text = data.message || '';
    const html = `<p>${text.replace(/</g, '&lt;')}</p>`;

    try {
      if (transport) {
        const info = await transport.sendMail({
          from: SMTP_FROM,
          to,
          subject,
          text,
          html
        });
        console.log('[EMAIL] Sent via SMTP → to=%s subject="%s" messageId=%s', to, subject, info.messageId);
      } else {
        console.log('[EMAIL:FALLBACK] to=%s subject="%s" text="%s"', to, subject, text);
      }
      ch.ack(msg);
    } catch (err) {
      console.error('[EMAIL] SMTP error ->', err.message);
      // Nack with requeue to retry transient failures
      ch.nack(msg, false, true);
    }
  }, { noAck:false });
})();