import 'dotenv/config';
export const AMQP_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export async function connect(amqp) {
  const conn = await amqp.connect(AMQP_URL);
  const ch = await conn.createChannel();
  return { conn, ch };
}

export async function graceful(conn, ch) {
  process.on('SIGINT', async () => {
    try { await ch.close(); await conn.close(); } catch {}
    process.exit(0);
  });
}