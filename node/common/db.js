import 'dotenv/config';
import { Sequelize, DataTypes } from 'sequelize';

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'notifydb',
  process.env.DB_USER || 'notify',
  process.env.DB_PASS || 'notify123',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
  }
);

export const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  channel: { type: DataTypes.ENUM('email','sms','push'), allowNull: false },
  type:    { type: DataTypes.STRING(64), allowNull: false },
  to:      { type: DataTypes.STRING(255), allowNull: false },
  subject: { type: DataTypes.STRING(255) },
  message: { type: DataTypes.TEXT },
  status:  { type: DataTypes.ENUM('pending','published','failed'), defaultValue: 'pending' },
}, {
  tableName: 'notifications',
  underscored: true
});