import sqlite3 from 'sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const isPostgres = !!process.env.DATABASE_URL;
let db = null;
let pgPool = null;

// Initialize connection
if (isPostgres) {
  console.log("Database: Using PostgreSQL");
  const connectionString = process.env.DATABASE_URL;
  const useSSL = process.env.NODE_ENV === 'production' || 
                 (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));
  pgPool = new pg.Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
  });
} else {
  console.log("Database: Using SQLite (lending.db)");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = path.resolve(__dirname, '../lending.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("Error opening SQLite database:", err.message);
    } else {
      // Enable foreign keys
      db.run("PRAGMA foreign_keys = ON;");
    }
  });
}

// Translate PostgreSQL $1, $2 params to SQLite ? params
function translateSqlForSqlite(sql) {
  return sql.replace(/\$\d+/g, '?');
}

// Unified query wrapper
export async function query(text, params = []) {
  if (isPostgres) {
    try {
      const res = await pgPool.query(text, params);
      return res;
    } catch (err) {
      console.error("Postgres Query Error:", err);
      throw err;
    }
  } else {
    return new Promise((resolve, reject) => {
      const sqliteSql = translateSqlForSqlite(text);
      const cleanSql = text.trim().toLowerCase();

      if (cleanSql.startsWith('select') || cleanSql.startsWith('pragma') || cleanSql.startsWith('with')) {
        db.all(sqliteSql, params, (err, rows) => {
          if (err) {
            console.error("SQLite Query Error:", err, "SQL:", sqliteSql);
            return reject(err);
          }
          resolve({ rows });
        });
      } else {
        db.run(sqliteSql, params, function (err) {
          if (err) {
            console.error("SQLite Exec Error:", err, "SQL:", sqliteSql);
            return reject(err);
          }
          resolve({
            rows: [],
            lastID: this.lastID,
            changes: this.changes
          });
        });
      }
    });
  }
}

// Create database schema
export async function setupDatabase() {
  if (isPostgres) {
    // Postgres Schema
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        credit_limit DOUBLE PRECISION NOT NULL DEFAULT 50000.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DOUBLE PRECISION NOT NULL,
        interest_rate DOUBLE PRECISION NOT NULL,
        term_months INTEGER NOT NULL,
        calculation_type VARCHAR(50) NOT NULL DEFAULT 'amortization',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        amount DOUBLE PRECISION NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        receipt_image TEXT,
        notes TEXT
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    // SQLite Schema
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        credit_limit REAL NOT NULL DEFAULT 50000.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        interest_rate REAL NOT NULL,
        term_months INTEGER NOT NULL,
        calculation_type TEXT NOT NULL DEFAULT 'amortization',
        status TEXT NOT NULL DEFAULT 'pending',
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        receipt_image TEXT,
        notes TEXT,
        FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        loan_id INTEGER,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE SET NULL
      );
    `);
  }
  console.log("Database schema setup complete.");
}
