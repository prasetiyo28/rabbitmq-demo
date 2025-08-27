import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import Joi from 'joi';
import amqp from 'amqplib';
import { connect as amqpConnect } from './common/config.js';
import { sequelize, Notification } from './common/db.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const schema = Joi.object({
  channel: Joi.string().valid('email','sms','push').required(),
  type: Joi.string().max(64).required(),
  to: Joi.string().max(255).required(),
  subject: Joi.string().max(255).allow(''),
  message: Joi.string().allow('')
});

const EX = 'notify.exchange';

async function ensureAMQP(ch) {
  await ch.assertExchange(EX, 'topic', { durable: true });
}

app.get('/health', (req,res)=> res.json({ ok: true }));

// Create notification (store in DB, publish to RabbitMQ)
app.post('/api/notifications', async (req, res) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ message: 'Invalid payload', details: error.details });

  const t = await sequelize.transaction();
  try {
    const notif = await Notification.create({
      channel: value.channel,
      type: value.type,
      to: value.to,
      subject: value.subject || '',
      message: value.message || '',
      status: 'pending'
    }, { transaction: t });

    // Publish to RabbitMQ
    const { conn, ch } = await amqpConnect(amqp);
    await ensureAMQP(ch);
    const key = `notify.${notif.channel}.${notif.type}`;
    const payload = {
      id: notif.id,
      to: notif.to,
      subject: notif.subject,
      message: notif.message,
      channel: notif.channel,
      type: notif.type,
      ts: new Date().toISOString()
    };
    ch.publish(EX, key, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: notif.id
    });
    await ch.close(); await conn.close();

    // Update status -> published
    notif.status = 'published';
    await notif.save({ transaction: t });

    await t.commit();
    res.status(201).json({ id: notif.id, status: notif.status, routingKey: key });
  } catch (e) {
    await t.rollback();
    console.error('Publish error:', e);
    res.status(500).json({ message: 'Failed to publish', error: e.message });
  }
});

// List notifications
app.get('/api/notifications', async (req, res) => {
  const list = await Notification.findAll({ order: [['created_at','DESC']], limit: 100 });
  res.json(list);
});

// Detail by id
app.get('/api/notifications/:id', async (req, res) => {
  const one = await Notification.findByPk(req.params.id);
  if (!one) return res.status(404).json({ message: 'Not found' });
  res.json(one);
});

const PORT = process.env.PORT || 3000;

(async ()=>{
  await sequelize.authenticate();
  await sequelize.sync(); // auto create table if not exists
  app.listen(PORT, ()=> console.log(`API server running at http://localhost:${PORT}`));
})();