import sqlite3 from 'sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqliteDbPath = path.resolve(__dirname, '../lending.db');

// Read database URL
const postgresUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/quickfund';
console.log(`Target PostgreSQL URL: ${postgresUrl}`);

// Parse connection URL to connect to default "postgres" db first
const parsedUrl = new URL(postgresUrl);
const targetDb = parsedUrl.pathname.substring(1) || 'quickfund';

// Connection string to default "postgres" database
parsedUrl.pathname = '/postgres';
const defaultPostgresUrl = parsedUrl.toString();

// SSL configuration for PostgreSQL connections (e.g. for external cloud databases)
const sslConfig = (process.env.NODE_ENV === 'production' || (!postgresUrl.includes('localhost') && !postgresUrl.includes('127.0.0.1')))
  ? { rejectUnauthorized: false }
  : false;

async function runMigration() {
  console.log("=== STARTING SQLITE TO POSTGRESQL MIGRATION ===");
  
  // 1. Connect to default database and create target database if not exists
  console.log(`Connecting to default DB to check database '${targetDb}'...`);
  const defaultClient = new pg.Client({ 
    connectionString: defaultPostgresUrl,
    ssl: sslConfig,
    connectionTimeoutMillis: 5000
  });
  let defaultDbConnected = false;
  try {
    await defaultClient.connect();
    defaultDbConnected = true;
    const dbExistRes = await defaultClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
    if (dbExistRes.rows.length === 0) {
      console.log(`Database '${targetDb}' does not exist. Creating it...`);
      // CREATE DATABASE cannot run inside a transaction block, pg Client query works
      await defaultClient.query(`CREATE DATABASE ${targetDb}`);
      console.log(`Database '${targetDb}' created successfully.`);
    } else {
      console.log(`Database '${targetDb}' already exists.`);
    }
  } catch (err) {
    console.warn(`[Warning] Could not connect to default database or create target database: ${err.message}`);
    console.warn("If you are using a cloud provider (e.g. Supabase, Neon, Railway) where the target database is pre-created, you can ignore this warning.");
  } finally {
    await defaultClient.end().catch(() => {});
  }

  // 2. Connect to the target database and setup tables
  console.log(`Connecting to target DB '${targetDb}' to verify tables schema...`);
  const pgClient = new pg.Client({ 
    connectionString: postgresUrl,
    ssl: sslConfig,
    connectionTimeoutMillis: 5000
  });

  let pgClientConnected = false;
  let sqliteDb = null;
  try {
    await pgClient.connect();
    pgClientConnected = true;
    // Setup target database tables schema
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        credit_limit DOUBLE PRECISION NOT NULL DEFAULT 50000.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        amount DOUBLE PRECISION NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        receipt_image TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("PostgreSQL schema validated.");

    // Clean tables before migrating to avoid duplicates
    console.log("Clearing existing PostgreSQL data for clean migration...");
    await pgClient.query("TRUNCATE TABLE transactions, payments, loans, users RESTART IDENTITY CASCADE;");

    // 3. Connect to SQLite and fetch data
    console.log(`Connecting to source SQLite database: ${sqliteDbPath}`);
    sqliteDb = new sqlite3.Database(sqliteDbPath);
    
    const fetchFromSqlite = (table) => {
      return new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM ${table}`, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };

    // Load tables
    const sqliteUsers = await fetchFromSqlite('users');
    const sqliteLoans = await fetchFromSqlite('loans');
    const sqlitePayments = await fetchFromSqlite('payments');
    const sqliteTransactions = await fetchFromSqlite('transactions');

    console.log(`Loaded from SQLite: ${sqliteUsers.length} users, ${sqliteLoans.length} loans, ${sqlitePayments.length} payments, ${sqliteTransactions.length} transactions.`);

    // 4. Insert data into PostgreSQL (maintaining IDs)
    console.log("Migrating users...");
    for (const u of sqliteUsers) {
      await pgClient.query(
        "INSERT INTO users (id, name, email, password, role, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [u.id, u.name, u.email, u.password, u.role, u.credit_limit, u.created_at ? new Date(u.created_at) : new Date()]
      );
    }

    console.log("Migrating loans...");
    for (const l of sqliteLoans) {
      await pgClient.query(
        "INSERT INTO loans (id, user_id, amount, interest_rate, term_months, calculation_type, status, approved_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [l.id, l.user_id, l.amount, l.interest_rate, l.term_months, l.calculation_type, l.status, l.approved_at ? new Date(l.approved_at) : null, l.created_at ? new Date(l.created_at) : new Date()]
      );
    }

    console.log("Migrating payments...");
    for (const p of sqlitePayments) {
      await pgClient.query(
        "INSERT INTO payments (id, loan_id, amount, payment_date, receipt_image, notes) VALUES ($1, $2, $3, $4, $5, $6)",
        [p.id, p.loan_id, p.amount, p.payment_date ? new Date(p.payment_date) : new Date(), p.receipt_image, p.notes]
      );
    }

    console.log("Migrating transactions...");
    for (const t of sqliteTransactions) {
      await pgClient.query(
        "INSERT INTO transactions (id, user_id, loan_id, type, amount, date) VALUES ($1, $2, $3, $4, $5, $6)",
        [t.id, t.user_id, t.loan_id, t.type, t.amount, t.date ? new Date(t.date) : new Date()]
      );
    }

    // 5. Reset serial sequences to avoid insert key conflicts
    console.log("Resetting PostgreSQL primary key sequences...");
    await pgClient.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users), 1), false);");
    await pgClient.query("SELECT setval('loans_id_seq', COALESCE((SELECT MAX(id)+1 FROM loans), 1), false);");
    await pgClient.query("SELECT setval('payments_id_seq', COALESCE((SELECT MAX(id)+1 FROM payments), 1), false);");
    await pgClient.query("SELECT setval('transactions_id_seq', COALESCE((SELECT MAX(id)+1 FROM transactions), 1), false);");

    console.log("=== MIGRATION COMPLETED SUCCESSFULLY! ===");
  } catch (err) {
    console.error("\n❌ Migration failed with error:", err.message);
    if (err.message.includes("client password must be a string") || err.message.includes("password authentication failed")) {
      console.error("\n💡 Troubleshooting Tip: Your PostgreSQL server requires a password for authentication.");
      console.error("   Please update the DATABASE_URL environment variable in your .env file to include your password, e.g.:");
      console.error("   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/quickfund\n");
    } else if (err.message.includes("timeout") || err.code === 'ECONNREFUSED' || err.message.includes("timeout exceeded")) {
      console.error("\n💡 Troubleshooting Tip: Could not connect to PostgreSQL server.");
      console.error("   Please verify that your PostgreSQL server is running and listening on port 5432.\n");
    }
  } finally {
    if (sqliteDb) {
      sqliteDb.close();
    }
    await pgClient.end().catch(() => {});
  }
}

runMigration();
