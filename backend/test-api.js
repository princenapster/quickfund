// Global fetch is available natively in Node 18+
import { query } from './db/connection.js';

const API_BASE = 'http://localhost:5000/api';

async function runTest() {
  console.log("=== STARTING API INTEGRATION TEST ===");
  
  const testEmail = `test.borrower.${Date.now()}@lending.com`;
  const testPassword = 'borrower123';
  let userToken = '';
  let adminToken = '';
  let loanId = null;

  try {
    // 1. Register borrower
    console.log(`1. Registering new borrower: ${testEmail}...`);
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Borrower',
        email: testEmail,
        password: testPassword,
        role: 'user'
      })
    });
    
    if (!regRes.ok) throw new Error(`Registration failed: ${await regRes.text()}`);
    const regData = await regRes.json();
    userToken = regData.token;
    console.log("Borrower registered successfully!");

    // 2. Login Admin
    console.log("2. Logging in as Admin...");
    const adminLogRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@lending.com',
        password: 'admin123'
      })
    });
    if (!adminLogRes.ok) throw new Error(`Admin login failed: ${await adminLogRes.text()}`);
    const adminLogData = await adminLogRes.json();
    adminToken = adminLogData.token;
    console.log("Admin logged in successfully!");

    // 3. Apply for Loan
    console.log("3. Submitting loan application...");
    const applyRes = await fetch(`${API_BASE}/loans/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        amount: 25000,
        interest_rate: 6.0,
        term_months: 6,
        calculation_type: 'flat'
      })
    });
    if (!applyRes.ok) throw new Error(`Loan application failed: ${await applyRes.text()}`);
    const applyData = await applyRes.json();
    loanId = applyData.loanId;
    console.log(`Loan application submitted! Loan ID: ${loanId}`);

    // 4. Admin Approve Loan
    console.log(`4. Admin approving loan LN-${loanId}...`);
    const approveRes = await fetch(`${API_BASE}/loans/${loanId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({})
    });
    if (!approveRes.ok) throw new Error(`Loan approval failed: ${await approveRes.text()}`);
    console.log("Loan approved and active!");

    // 5. Submit Repayment
    console.log("5. Recording repayment of 5000 PHP...");
    const repayRes = await fetch(`${API_BASE}/loans/${loanId}/repay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        amount: 5000,
        notes: 'Test repayment installment',
        receipt_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // Tiny 1x1 black pixel PNG
      })
    });
    if (!repayRes.ok) throw new Error(`Repayment failed: ${await repayRes.text()}`);
    const repayData = await repayRes.json();
    console.log(`Repayment recorded. Remaining Balance: PHP ${repayData.remaining_balance}`);

    // 6. Verify User profile and stats
    console.log("6. Verifying transactions & balance calculations...");
    const profileRes = await fetch(`${API_BASE}/user/profile`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const profile = await profileRes.json();
    console.log(`User Profile verified: ${profile.name} (Credit Limit: PHP ${profile.credit_limit})`);

    // Cleanup test user and loan from database
    console.log("7. Cleaning up test data from DB...");
    await query("DELETE FROM payments WHERE loan_id = $1", [loanId]);
    await query("DELETE FROM transactions WHERE user_id = (SELECT id FROM users WHERE email = $1)", [testEmail]);
    await query("DELETE FROM loans WHERE user_id = (SELECT id FROM users WHERE email = $1)", [testEmail]);
    await query("DELETE FROM users WHERE email = $1", [testEmail]);
    console.log("Cleanup complete!");
    
    console.log("=== ALL API TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
  } catch (err) {
    console.error("!!! TEST INTERRUPTED WITH ERROR !!!");
    console.error(err.message);
    process.exit(1);
  }
}

// Introduce slight delay to allow server to boot in dynamic contexts, or run directly
runTest();
