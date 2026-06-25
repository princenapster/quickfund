import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { query, setupDatabase } from './db/connection.js';

dotenv.config();

const fastify = Fastify({ logger: true });

// Check database type
const isPostgres = !!process.env.DATABASE_URL;

// Register plugins
await fastify.register(cors, {
  origin: '*'
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'lending-app-super-secret-key-1234567890'
});

// Authentication hook
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized access" });
  }
});

// Helper: Calculate loan interest and payments
function calculateLoanDetails(amount, rate, termMonths, type) {
  const P = parseFloat(amount);
  const R = parseFloat(rate); // Annual interest rate
  const N = parseInt(termMonths);

  if (type === 'flat') {
    // Flat Rate calculation (Interest = P * R_annual * Time_years)
    const timeYears = N / 12;
    const totalInterest = P * (R / 100) * timeYears;
    const totalRepayment = P + totalInterest;
    const monthlyPayment = totalRepayment / N;
    return {
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalRepayment: Math.round(totalRepayment * 100) / 100
    };
  } else {
    // Amortization (fixed monthly payments)
    const monthlyRate = (R / 12) / 100;
    if (monthlyRate === 0) {
      const monthlyPayment = P / N;
      return {
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalInterest: 0,
        totalRepayment: P
      };
    }
    const monthlyPayment = (P * monthlyRate * Math.pow(1 + monthlyRate, N)) / (Math.pow(1 + monthlyRate, N) - 1);
    const totalRepayment = monthlyPayment * N;
    const totalInterest = totalRepayment - P;
    return {
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalRepayment: Math.round(totalRepayment * 100) / 100
    };
  }
}

// Root Route / Health Check
fastify.get('/', async (request, reply) => {
  return { status: "ok", message: "LendSync Backend API is running successfully." };
});

// ---------------- AUTH ROUTES ----------------

// Register
fastify.post('/api/auth/register', async (request, reply) => {
  const { name, email, password, role } = request.body;
  
  if (!name || !email || !password) {
    return reply.status(400).send({ error: "Please fill in all fields" });
  }

  try {
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return reply.status(400).send({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const limit = userRole === 'admin' ? 0 : 50000.0; // Default 50k credit limit for borrowers

    let userId;
    if (isPostgres) {
      const res = await query(
        "INSERT INTO users (name, email, password, role, credit_limit) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [name, email, hashedPassword, userRole, limit]
      );
      userId = res.rows[0].id;
    } else {
      const res = await query(
        "INSERT INTO users (name, email, password, role, credit_limit) VALUES ($1, $2, $3, $4, $5)",
        [name, email, hashedPassword, userRole, limit]
      );
      userId = res.lastID;
    }

    const token = fastify.jwt.sign({ id: userId, email, role: userRole, name });
    return { token, user: { id: userId, name, email, role: userRole, credit_limit: limit } };
  } catch (err) {
    reply.status(500).send({ error: "Database registration error" });
  }
});

// Login
fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.status(400).send({ error: "Email and password are required" });
  }

  try {
    const res = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (res.rows.length === 0) {
      return reply.status(400).send({ error: "Invalid email or password" });
    }

    const user = res.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return reply.status(400).send({ error: "Invalid email or password" });
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        credit_limit: user.credit_limit
      }
    };
  } catch (err) {
    reply.status(500).send({ error: "Database login error" });
  }
});

// Get profile
fastify.get('/api/user/profile', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  try {
    const res = await query("SELECT id, name, email, role, credit_limit FROM users WHERE id = $1", [request.user.id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }
    return res.rows[0];
  } catch (err) {
    reply.status(500).send({ error: "Database query error" });
  }
});

// ---------------- LOAN ROUTES ----------------

// Apply for a loan
fastify.post('/api/loans/apply', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { amount, interest_rate, term_months, calculation_type } = request.body;
  const userId = request.user.id;

  if (!amount || !interest_rate || !term_months || !calculation_type) {
    return reply.status(400).send({ error: "All fields are required" });
  }

  try {
    // Fetch user details for credit limit check
    const userRes = await query("SELECT credit_limit FROM users WHERE id = $1", [userId]);
    const creditLimit = userRes.rows[0].credit_limit;

    // Fetch user's active/approved outstanding loans sum
    const activeLoansRes = await query(
      "SELECT id, amount, interest_rate, term_months, calculation_type FROM loans WHERE user_id = $1 AND status IN ('active', 'approved')",
      [userId]
    );

    let outstandingTotal = 0;
    for (const loan of activeLoansRes.rows) {
      // Calculate total expected repayment for each active loan
      const details = calculateLoanDetails(loan.amount, loan.interest_rate, loan.term_months, loan.calculation_type);
      
      // Fetch payments made for this loan
      const paymentsRes = await query("SELECT SUM(amount) as paid FROM payments WHERE loan_id = $1", [loan.id]);
      const paid = parseFloat(paymentsRes.rows[0]?.paid || paymentsRes.rows[0]?.PAID || 0);
      outstandingTotal += (details.totalRepayment - paid);
    }

    const requestedAmount = parseFloat(amount);
    if (outstandingTotal + requestedAmount > creditLimit) {
      return reply.status(400).send({
        error: `Requested loan exceeds your available credit limit. Current Outstanding: PHP ${outstandingTotal.toLocaleString()}, Credit Limit: PHP ${creditLimit.toLocaleString()}. Available: PHP ${(creditLimit - outstandingTotal).toLocaleString()}`
      });
    }

    let loanId;
    if (isPostgres) {
      const res = await query(
        "INSERT INTO loans (user_id, amount, interest_rate, term_months, calculation_type, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id",
        [userId, requestedAmount, parseFloat(interest_rate), parseInt(term_months), calculation_type]
      );
      loanId = res.rows[0].id;
    } else {
      const res = await query(
        "INSERT INTO loans (user_id, amount, interest_rate, term_months, calculation_type, status) VALUES ($1, $2, $3, $4, $5, 'pending')",
        [userId, requestedAmount, parseFloat(interest_rate), parseInt(term_months), calculation_type]
      );
      loanId = res.lastID;
    }

    return { message: "Loan application submitted successfully", loanId };
  } catch (err) {
    reply.status(500).send({ error: "Failed to submit loan application" });
  }
});

// View all loans (Borrower sees theirs; Admin sees all)
fastify.get('/api/loans', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role, id: userId } = request.user;

  try {
    let loansRes;
    if (role === 'admin') {
      loansRes = await query(
        `SELECT l.*, u.name as borrower_name, u.email as borrower_email 
         FROM loans l 
         JOIN users u ON l.user_id = u.id 
         ORDER BY l.created_at DESC`
      );
    } else {
      loansRes = await query(
        "SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
    }

    const loansWithDetails = [];
    for (const loan of loansRes.rows) {
      const details = calculateLoanDetails(loan.amount, loan.interest_rate, loan.term_months, loan.calculation_type);
      
      // Get paid sum
      const paymentsRes = await query("SELECT SUM(amount) as paid FROM payments WHERE loan_id = $1", [loan.id]);
      const paid = parseFloat(paymentsRes.rows[0]?.paid || paymentsRes.rows[0]?.PAID || 0);

      loansWithDetails.push({
        ...loan,
        monthly_payment: details.monthlyPayment,
        total_interest: details.totalInterest,
        total_expected_repayment: details.totalRepayment,
        total_paid: paid,
        outstanding_balance: Math.max(0, Math.round((details.totalRepayment - paid) * 100) / 100)
      });
    }

    return loansWithDetails;
  } catch (err) {
    reply.status(500).send({ error: "Failed to retrieve loans" });
  }
});

// Get specific loan details
fastify.get('/api/loans/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { id } = request.params;
  const { role, id: userId } = request.user;

  try {
    const loanRes = await query("SELECT * FROM loans WHERE id = $1", [id]);
    if (loanRes.rows.length === 0) {
      return reply.status(404).send({ error: "Loan not found" });
    }

    const loan = loanRes.rows[0];
    if (role !== 'admin' && loan.user_id !== userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const details = calculateLoanDetails(loan.amount, loan.interest_rate, loan.term_months, loan.calculation_type);
    
    // Get payments list
    const paymentsRes = await query("SELECT * FROM payments WHERE loan_id = $1 ORDER BY payment_date DESC", [loan.id]);
    const totalPaid = paymentsRes.rows.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...loan,
      monthly_payment: details.monthlyPayment,
      total_interest: details.totalInterest,
      total_expected_repayment: details.totalRepayment,
      total_paid: totalPaid,
      outstanding_balance: Math.max(0, Math.round((details.totalRepayment - totalPaid) * 100) / 100),
      payments: paymentsRes.rows
    };
  } catch (err) {
    reply.status(500).send({ error: "Failed to retrieve loan details" });
  }
});

// ---------------- ADMIN ACTION ROUTES ----------------

// Approve loan
fastify.post('/api/loans/:id/approve', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role } = request.user;
  const { id } = request.params;

  if (role !== 'admin') {
    return reply.status(403).send({ error: "Admin role required" });
  }

  try {
    const loanRes = await query("SELECT * FROM loans WHERE id = $1", [id]);
    if (loanRes.rows.length === 0) {
      return reply.status(404).send({ error: "Loan not found" });
    }

    const loan = loanRes.rows[0];
    if (loan.status !== 'pending') {
      return reply.status(400).send({ error: `Cannot approve loan with status '${loan.status}'` });
    }

    // Approve the loan
    const now = new Date().toISOString();
    await query("UPDATE loans SET status = 'active', approved_at = $1 WHERE id = $2", [now, id]);

    // Record disbursement transaction
    if (isPostgres) {
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount) VALUES ($1, $2, 'disbursement', $3) RETURNING id",
        [loan.user_id, id, loan.amount]
      );
    } else {
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount) VALUES ($1, $2, 'disbursement', $3)",
        [loan.user_id, id, loan.amount]
      );
    }

    return { message: "Loan approved and active. Funds disbursed." };
  } catch (err) {
    reply.status(500).send({ error: "Failed to approve loan" });
  }
});

// Reject loan
fastify.post('/api/loans/:id/reject', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role } = request.user;
  const { id } = request.params;

  if (role !== 'admin') {
    return reply.status(403).send({ error: "Admin role required" });
  }

  try {
    const loanRes = await query("SELECT * FROM loans WHERE id = $1", [id]);
    if (loanRes.rows.length === 0) {
      return reply.status(404).send({ error: "Loan not found" });
    }

    const loan = loanRes.rows[0];
    if (loan.status !== 'pending') {
      return reply.status(400).send({ error: `Cannot reject loan with status '${loan.status}'` });
    }

    await query("UPDATE loans SET status = 'rejected' WHERE id = $1", [id]);
    return { message: "Loan application rejected." };
  } catch (err) {
    reply.status(500).send({ error: "Failed to reject loan" });
  }
});

// ---------------- REPAYMENT ROUTES ----------------

// Repay (Submit/Log payment manually with screenshot upload)
fastify.post('/api/loans/:id/repay', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { id } = request.params;
  const { amount, receipt_image, notes } = request.body;
  const { id: userId, role } = request.user;

  if (!amount || parseFloat(amount) <= 0) {
    return reply.status(400).send({ error: "Valid repayment amount is required" });
  }

  try {
    const loanRes = await query("SELECT * FROM loans WHERE id = $1", [id]);
    if (loanRes.rows.length === 0) {
      return reply.status(404).send({ error: "Loan not found" });
    }

    const loan = loanRes.rows[0];
    // Check ownership if not admin
    if (role !== 'admin' && loan.user_id !== userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    if (loan.status !== 'active') {
      return reply.status(400).send({ error: `Repayment not allowed. Loan is currently '${loan.status}'` });
    }

    const paymentAmount = parseFloat(amount);
    const details = calculateLoanDetails(loan.amount, loan.interest_rate, loan.term_months, loan.calculation_type);

    // Sum of previous payments
    const paymentsRes = await query("SELECT SUM(amount) as paid FROM payments WHERE loan_id = $1", [id]);
    const totalPaidBefore = parseFloat(paymentsRes.rows[0]?.paid || paymentsRes.rows[0]?.PAID || 0);

    const remainingToPay = details.totalRepayment - totalPaidBefore;
    if (paymentAmount > remainingToPay + 0.01) { // Add tiny float offset tolerance
      return reply.status(400).send({
        error: `Repayment amount (PHP ${paymentAmount}) exceeds the remaining balance (PHP ${Math.max(0, remainingToPay).toFixed(2)})`
      });
    }

    // Insert payment
    if (isPostgres) {
      await query(
        "INSERT INTO payments (loan_id, amount, receipt_image, notes) VALUES ($1, $2, $3, $4) RETURNING id",
        [id, paymentAmount, receipt_image || null, notes || "Manual Repayment"]
      );
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount) VALUES ($1, $2, 'repayment', $3) RETURNING id",
        [loan.user_id, id, paymentAmount]
      );
    } else {
      await query(
        "INSERT INTO payments (loan_id, amount, receipt_image, notes) VALUES ($1, $2, $3, $4)",
        [id, paymentAmount, receipt_image || null, notes || "Manual Repayment"]
      );
      await query(
        "INSERT INTO transactions (user_id, loan_id, type, amount) VALUES ($1, $2, 'repayment', $3)",
        [loan.user_id, id, paymentAmount]
      );
    }

    // Update status to 'paid' if completed
    const finalPaid = totalPaidBefore + paymentAmount;
    if (finalPaid >= details.totalRepayment - 0.01) {
      await query("UPDATE loans SET status = 'paid' WHERE id = $1", [id]);
    }

    return { message: "Repayment recorded successfully.", remaining_balance: Math.max(0, details.totalRepayment - finalPaid) };
  } catch (err) {
    reply.status(500).send({ error: "Failed to process repayment" });
  }
});

// Get user transaction history
fastify.get('/api/transactions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { id: userId, role } = request.user;

  try {
    let txRes;
    if (role === 'admin') {
      txRes = await query(
        `SELECT t.*, u.name as borrower_name, u.email as borrower_email 
         FROM transactions t
         JOIN users u ON t.user_id = u.id
         ORDER BY t.date DESC`
      );
    } else {
      txRes = await query(
        "SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC",
        [userId]
      );
    }
    return txRes.rows;
  } catch (err) {
    reply.status(500).send({ error: "Failed to fetch transactions" });
  }
});

// ---------------- ADMIN SUMMARY & USERS ----------------

// Get global stats
fastify.get('/api/admin/stats', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role } = request.user;

  if (role !== 'admin') {
    return reply.status(403).send({ error: "Forbidden" });
  }

  try {
    const loansRes = await query("SELECT id, amount, interest_rate, term_months, calculation_type, status FROM loans");
    
    let totalPortfolio = 0; // Total principal disbursed
    let totalInterestExpected = 0; // Total interest expected
    let activeLoansCount = 0;
    let pendingLoansCount = 0;

    for (const loan of loansRes.rows) {
      if (loan.status === 'active' || loan.status === 'paid') {
        totalPortfolio += loan.amount;
        const details = calculateLoanDetails(loan.amount, loan.interest_rate, loan.term_months, loan.calculation_type);
        totalInterestExpected += details.totalInterest;
      }
      if (loan.status === 'active') activeLoansCount++;
      if (loan.status === 'pending') pendingLoansCount++;
    }

    // Get total actual payments
    const paymentsRes = await query("SELECT SUM(amount) as paid FROM payments");
    const totalPaymentsReceived = parseFloat(paymentsRes.rows[0]?.paid || paymentsRes.rows[0]?.PAID || 0);

    // Get active borrowers count
    const borrowersRes = await query(
      "SELECT COUNT(DISTINCT user_id) as count FROM loans WHERE status = 'active'"
    );
    const activeBorrowersCount = borrowersRes.rows[0]?.count || borrowersRes.rows[0]?.COUNT || 0;

    // Portfolio metrics
    const totalExpectedRepayment = totalPortfolio + totalInterestExpected;
    const collectionRate = totalExpectedRepayment > 0 
      ? Math.round((totalPaymentsReceived / totalExpectedRepayment) * 10000) / 100 
      : 0;

    return {
      total_portfolio: totalPortfolio,
      total_interest_expected: totalInterestExpected,
      total_collected: totalPaymentsReceived,
      outstanding_balance: Math.max(0, Math.round((totalExpectedRepayment - totalPaymentsReceived) * 100) / 100),
      active_loans: activeLoansCount,
      pending_loans: pendingLoansCount,
      active_borrowers: activeBorrowersCount,
      collection_rate: collectionRate
    };
  } catch (err) {
    reply.status(500).send({ error: "Failed to retrieve statistics" });
  }
});

// List all users
fastify.get('/api/admin/users', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role } = request.user;

  if (role !== 'admin') {
    return reply.status(403).send({ error: "Forbidden" });
  }

  try {
    const usersRes = await query(
      `SELECT id, name, email, role, credit_limit, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    return usersRes.rows;
  } catch (err) {
    reply.status(500).send({ error: "Failed to retrieve users" });
  }
});

// Update credit limit
fastify.post('/api/admin/users/:id/credit-limit', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { role } = request.user;
  const { id } = request.params;
  const { credit_limit } = request.body;

  if (role !== 'admin') {
    return reply.status(403).send({ error: "Forbidden" });
  }

  if (credit_limit === undefined || parseFloat(credit_limit) < 0) {
    return reply.status(400).send({ error: "Valid credit limit is required" });
  }

  try {
    const newLimit = parseFloat(credit_limit);
    await query("UPDATE users SET credit_limit = $1 WHERE id = $2", [newLimit, id]);
    return { message: "Credit limit updated successfully", credit_limit: newLimit };
  } catch (err) {
    reply.status(500).send({ error: "Failed to update credit limit" });
  }
});

// Export default handler for serverless environments (Vercel)
export default async function handler(req, res) {
  await setupDatabase();
  await fastify.ready();
  fastify.server.emit('request', req, res);
}

// Start the server for local execution
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  const start = async () => {
    try {
      await setupDatabase();
      await fastify.listen({ port, host: '0.0.0.0' });
      console.log(`Server is running on port ${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  start();
}
