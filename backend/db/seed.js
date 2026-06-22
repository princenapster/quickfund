import bcrypt from 'bcryptjs';
import { query, setupDatabase } from './connection.js';

async function seed() {
  try {
    console.log("Setting up tables...");
    await setupDatabase();

    console.log("Checking if users already exist...");
    const usersExist = await query("SELECT COUNT(*) as count FROM users");
    const count = usersExist.rows[0]?.count || usersExist.rows[0]?.COUNT || 0;
    if (count > 0) {
      console.log("Database already seeded. Skipping seeding.");
      return;
    }

    console.log("Seeding users...");
    const adminHash = await bcrypt.hash('admin123', 10);
    const borrowerHash = await bcrypt.hash('borrower123', 10);
    const johnHash = await bcrypt.hash('john123', 10);

    // Insert Users
    await query(
      "INSERT INTO users (name, email, password, role, credit_limit) VALUES ($1, $2, $3, $4, $5)",
      ["Lending Admin", "admin@lending.com", adminHash, "admin", 0]
    );
    await query(
      "INSERT INTO users (name, email, password, role, credit_limit) VALUES ($1, $2, $3, $4, $5)",
      ["Mary Smith", "borrower@lending.com", borrowerHash, "user", 100000.0]
    );
    await query(
      "INSERT INTO users (name, email, password, role, credit_limit) VALUES ($1, $2, $3, $4, $5)",
      ["John Doe", "john.doe@lending.com", johnHash, "user", 50000.0]
    );

    // Retrieve IDs
    const adminRes = await query("SELECT id FROM users WHERE email = $1", ["admin@lending.com"]);
    const adminId = adminRes.rows[0].id;
    const borrowerRes = await query("SELECT id FROM users WHERE email = $1", ["borrower@lending.com"]);
    const borrowerId = borrowerRes.rows[0].id;
    const johnRes = await query("SELECT id FROM users WHERE email = $1", ["john.doe@lending.com"]);
    const johnId = johnRes.rows[0].id;

    console.log(`Seeded users. Admin ID: ${adminId}, Borrower ID: ${borrowerId}, John ID: ${johnId}`);

    // Seeding loans
    console.log("Seeding loans...");
    // 1. Paid Loan for Borrower
    await query(
      "INSERT INTO loans (user_id, amount, interest_rate, term_months, calculation_type, status, created_at, approved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [borrowerId, 10000, 8.0, 3, "amortization", "paid", "2026-02-15 10:00:00", "2026-02-16 09:00:00"]
    );
    const paidLoanRes = await query("SELECT id FROM loans WHERE user_id = $1 AND status = 'paid'", [borrowerId]);
    const paidLoanId = paidLoanRes.rows[0].id;

    // 2. Active Loan for Borrower
    await query(
      "INSERT INTO loans (user_id, amount, interest_rate, term_months, calculation_type, status, created_at, approved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [borrowerId, 30000, 5.0, 6, "flat", "active", "2026-04-10 14:00:00", "2026-04-12 11:30:00"]
    );
    const activeLoanRes = await query("SELECT id FROM loans WHERE user_id = $1 AND status = 'active'", [borrowerId]);
    const activeLoanId = activeLoanRes.rows[0].id;

    // 3. Pending Loan for John Doe
    await query(
      "INSERT INTO loans (user_id, amount, interest_rate, term_months, calculation_type, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [johnId, 15000, 10.0, 12, "amortization", "pending", "2026-06-18 15:45:00"]
    );

    // Seeding payments and transactions
    console.log("Seeding payments & transactions...");
    
    // Transactions for loan disbursements
    await query(
      "INSERT INTO transactions (user_id, loan_id, type, amount, date) VALUES ($1, $2, $3, $4, $5)",
      [borrowerId, paidLoanId, "disbursement", 10000, "2026-02-16 09:00:00"]
    );
    await query(
      "INSERT INTO transactions (user_id, loan_id, type, amount, date) VALUES ($1, $2, $3, $4, $5)",
      [borrowerId, activeLoanId, "disbursement", 30000, "2026-04-12 11:30:00"]
    );

    // Payments & Transactions for the Paid Loan
    const paidAmt = 3600.0;
    for (let i = 1; i <= 3; i++) {
      const paymentDate = `2026-0${2 + i}-16 10:00:00`;
      await query(
        "INSERT INTO payments (loan_id, amount, payment_date, notes) VALUES ($1, $2, $3, $4)",
        [paidLoanId, paidAmt, paymentDate, `Monthly installment ${i} of 3`]
      );
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount, date) VALUES ($1, $2, $3, $4, $5)",
        [borrowerId, paidLoanId, "repayment", paidAmt, paymentDate]
      );
    }

    // Payments & Transactions for the Active Loan
    const activeAmt = 6500.0;
    for (let i = 1; i <= 2; i++) {
      const paymentDate = `2026-0${4 + i}-12 12:00:00`;
      await query(
        "INSERT INTO payments (loan_id, amount, payment_date, notes) VALUES ($1, $2, $3, $4)",
        [activeLoanId, activeAmt, paymentDate, `Monthly installment ${i} of 6`]
      );
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount, date) VALUES ($1, $2, $3, $4, $5)",
        [borrowerId, activeLoanId, "repayment", activeAmt, paymentDate]
      );
    }

    console.log("Database successfully seeded!");
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}

seed();
