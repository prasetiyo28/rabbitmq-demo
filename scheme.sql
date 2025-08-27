-- Membuat database
CREATE DATABASE IF NOT EXISTS notifydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Menggunakan database
USE notifydb;

-- Membuat tabel notifications
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  channel ENUM('email','sms','push') NOT NULL,
  type VARCHAR(64) NOT NULL,
  `to` VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  status ENUM('pending','published','failed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;