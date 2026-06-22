import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Clock, 
  User, 
  Users, 
  CheckCircle, 
  XCircle, 
  Upload, 
  Image as ImageIcon, 
  FileText, 
  LogOut, 
  Plus, 
  Calculator, 
  ShieldAlert, 
  List, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet,
  Eye,
  RefreshCw
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

export default function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'user' });

  // Navigation
  const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'apply', 'history', 'users'

  // Application data state
  const [loans, setLoans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);

  // Live Calculator State
  const [calcForm, setCalcForm] = useState({ amount: 15000, rate: 8.0, term: 6, type: 'amortization' });
  const [calcResult, setCalcResult] = useState({ monthly: 0, interest: 0, total: 0 });

  // Loan Application State
  const [applyForm, setApplyForm] = useState({ amount: 20000, rate: 10.0, term: 12, type: 'amortization' });

  // Repayment State
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [activeRepayLoan, setActiveRepayLoan] = useState(null);
  const [repayForm, setRepayForm] = useState({ amount: '', notes: '', receiptImage: '' });

  // Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [activeReceiptUrl, setActiveReceiptUrl] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync token and user to localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [token, user]);

  // Load dashboard data based on role
  useEffect(() => {
    if (token && user) {
      fetchDashboardData();
    }
  }, [token, user, currentTab]);

  // Live Loan Calculator Effect
  useEffect(() => {
    const P = parseFloat(calcForm.amount) || 0;
    const R = parseFloat(calcForm.rate) || 0;
    const N = parseInt(calcForm.term) || 1;

    if (calcForm.type === 'flat') {
      const totalInterest = P * (R / 100) * (N / 12);
      const totalRepayment = P + totalInterest;
      const monthlyPayment = totalRepayment / N;
      setCalcResult({
        monthly: Math.round(monthlyPayment * 100) / 100,
        interest: Math.round(totalInterest * 100) / 100,
        total: Math.round(totalRepayment * 100) / 100
      });
    } else {
      const monthlyRate = (R / 12) / 100;
      if (monthlyRate === 0) {
        setCalcResult({ monthly: Math.round((P / N) * 100) / 100, interest: 0, total: P });
      } else {
        const monthlyPayment = (P * monthlyRate * Math.pow(1 + monthlyRate, N)) / (Math.pow(1 + monthlyRate, N) - 1);
        const totalRepayment = monthlyPayment * N;
        const totalInterest = totalRepayment - P;
        setCalcResult({
          monthly: Math.round(monthlyPayment * 100) / 100,
          interest: Math.round(totalInterest * 100) / 100,
          total: Math.round(totalRepayment * 100) / 100
        });
      }
    }
  }, [calcForm]);

  const apiFetch = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load profile info to sync balance/limit
      const profile = await apiFetch('/user/profile');
      setUser(profile);

      // Load Loans
      const loansData = await apiFetch('/loans');
      setLoans(loansData);

      // Load Transactions
      const txData = await apiFetch('/transactions');
      setTransactions(txData);

      if (user?.role === 'admin') {
        const statsData = await apiFetch('/admin/stats');
        setAdminStats(statsData);

        const usersData = await apiFetch('/admin/users');
        setAdminUsers(usersData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister 
        ? authForm 
        : { email: authForm.email, password: authForm.password };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      setToken(data.token);
      setUser(data.user);
      setSuccess('Logged in successfully!');
      setCurrentTab('dashboard');
      // Reset forms
      setAuthForm({ name: '', email: '', password: '', role: 'user' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setLoans([]);
    setTransactions([]);
    setAdminStats(null);
    setAdminUsers([]);
    setCurrentTab('dashboard');
    setSuccess('Logged out successfully.');
  };

  const handleApplyLoan = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await apiFetch('/loans/apply', {
        method: 'POST',
        body: JSON.stringify({
          amount: applyForm.amount,
          interest_rate: applyForm.rate,
          term_months: applyForm.term,
          calculation_type: applyForm.type
        })
      });
      setSuccess('Loan application submitted successfully! Waiting for Admin review.');
      setCurrentTab('dashboard');
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveLoan = async (loanId) => {
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch(`/loans/${loanId}/approve`, { method: 'POST' });
      setSuccess(data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRejectLoan = async (loanId) => {
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch(`/loans/${loanId}/reject`, { method: 'POST' });
      setSuccess(data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // limit 2MB
        setError('Screenshot image must be smaller than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setRepayForm({ ...repayForm, receiptImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRepayment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await apiFetch(`/loans/${activeRepayLoan.id}/repay`, {
        method: 'POST',
        body: JSON.stringify({
          amount: repayForm.amount,
          notes: repayForm.notes,
          receipt_image: repayForm.receiptImage
        })
      });
      setSuccess(data.message);
      setShowRepayModal(false);
      setActiveRepayLoan(null);
      setRepayForm({ amount: '', notes: '', receiptImage: '' });
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCreditLimit = async (userId, limit) => {
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch(`/admin/users/${userId}/credit-limit`, {
        method: 'POST',
        body: JSON.stringify({ credit_limit: limit })
      });
      setSuccess(data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  };

  // UI calculations
  const totalOutstanding = loans
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + l.outstanding_balance, 0);

  const availableCredit = user ? Math.max(0, user.credit_limit - totalOutstanding) : 0;

  // Render Login / Register
  if (!token) {
    return (
      <div className="auth-wrapper animate-fade-in">
        <div className="auth-split-container">
          
          {/* Left Side: Tito Jayson Poster & Taglines */}
          <div className="auth-left-banner">
            <img 
              src="/tito_jayson_poster.jpg" 
              alt="Tito Jayson - Your Helpful Budget Buddy" 
              className="poster-img"
              style={{ marginBottom: '1.5rem' }} 
            />
            <h1 style={{ color: 'var(--accent-cyan)', fontSize: '2rem', marginBottom: '0.5rem', fontWeight: 800 }}>SHORT ON BUDGET?</h1>
            <h2 style={{ color: '#ffffff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.25rem' }}>TITO JAYSON is ready to help!</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left', maxWidth: '340px', fontSize: '0.9rem', color: '#e2eefe', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>✔</span>
                <span>Need extra funds for personal or business expenses?</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>✔</span>
                <span>Fast, easy, and hassle-free process!</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>✔</span>
                <span>Here to support your budget needs!</span>
              </div>
            </div>

            <div style={{ background: '#ffffff', color: '#0a4b91', padding: '0.5rem 1.25rem', borderRadius: '30px', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
              EASY. FAST. FRIENDLY.
            </div>
            <p style={{ fontSize: '0.85rem', color: '#a5c4f7', marginTop: '0.75rem', fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>
              "Your helpful budget buddy!"
            </p>
          </div>

          {/* Right Side: Form */}
          <div className="auth-card-form">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div className="auth-logo">
                <Wallet size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Tito Jayson</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budget Buddy</p>
              </div>
            </div>

            {error && <div className="alert-box">{error}</div>}
            {success && <div style={{background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.2)', borderRadius: '12px', padding: '1rem', color: '#27ae60', fontSize: '0.9rem', marginBottom: '1rem'}}>{success}</div>}

            <form onSubmit={handleAuth}>
              {isRegister && (
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Mary Smith" 
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  placeholder="e.g. email@domain.com" 
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  required
                />
              </div>

              {isRegister && (
                <div className="form-group">
                  <label>Account Role</label>
                  <select 
                    value={authForm.role}
                    onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                  >
                    <option value="user">Borrower (Apply for budget support)</option>
                    <option value="admin">Admin / Loan Officer (Review applications)</option>
                  </select>
                </div>
              )}

              <button type="submit" className="btn btn-primary full-width" style={{ marginTop: '1rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : (isRegister ? 'Register Account' : 'Secure Login')}
              </button>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {isRegister ? 'Already registered? ' : "New borrower? "}
              </span>
              <span 
                style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--primary)' }}
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
              >
                {isRegister ? 'Sign In Here' : 'Register Now'}
              </span>
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <p>💡 Pre-seeded Test Accounts:</p>
              <p style={{ marginTop: '0.15rem' }}>Admin: <strong>admin@lending.com</strong> / <strong>admin123</strong></p>
              <p>Borrower: <strong>borrower@lending.com</strong> / <strong>borrower123</strong></p>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* HEADER NAVBAR */}
      <header className="glass-panel" style={{ borderRadius: '0 0 20px 20px', padding: '1rem 2rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justify: 'center', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)', width: 42, height: 42, borderRadius: '12px', color: '#0b0f19' }}>
            <Wallet size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>Tito Jayson <span style={{ fontSize: '0.95rem' }}>👍</span></h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ROLE: <span className={user?.role === 'admin' ? 'glow-text-purple' : 'glow-text-cyan'} style={{ fontWeight: 800 }}>{user?.role?.toUpperCase()}</span></p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${currentTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentTab('dashboard')}
          >
            Dashboard
          </button>
          
          {user?.role === 'user' && (
            <>
              <button 
                className={`btn ${currentTab === 'apply' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentTab('apply')}
              >
                Apply for Loan
              </button>
              <button 
                className={`btn ${currentTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentTab('history')}
              >
                History
              </button>
            </>
          )}

          {user?.role === 'admin' && (
            <>
              <button 
                className={`btn ${currentTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentTab('users')}
              >
                Manage Borrowers
              </button>
            </>
          )}
        </nav>

        {/* User profile / Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', display: 'none', sm: 'block' }}>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.name}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
          <button className="btn btn-danger btn-icon" onClick={logout} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
        
        {/* Global Notifications */}
        {error && <div className="alert-box" style={{ marginBottom: '1.5rem' }}>{error}</div>}
        {success && <div style={{background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px', padding: '1rem', color: '#34d399', fontSize: '0.9rem', marginBottom: '1.5rem'}}>{success}</div>}

        {/* ========================================================
            BORROWER (USER) VIEW 
           ======================================================== */}
        {user?.role === 'user' && (
          <>
            {currentTab === 'dashboard' && (
              <div className="main-grid">
                
                {/* Left Side: Stats and Active Loans */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Stats Cards */}
                  <div className="dashboard-grid">
                    <div className="glass-panel stat-card glass-panel-glow-cyan">
                      <div className="stat-icon stat-icon-cyan">
                        <Wallet size={24} />
                      </div>
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>CREDIT LIMIT</p>
                        <p className="stat-number">₱{user.credit_limit.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="glass-panel stat-card glass-panel-glow-purple">
                      <div className="stat-icon stat-icon-purple">
                        <ArrowUpRight size={24} />
                      </div>
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>OUTSTANDING BALANCE</p>
                        <p className="stat-number" style={{ color: '#f43f5e' }}>₱{totalOutstanding.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="glass-panel stat-card glass-panel-glow-cyan">
                      <div className="stat-icon stat-icon-emerald">
                        <ArrowDownLeft size={24} />
                      </div>
                      <div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>AVAILABLE CREDIT</p>
                        <p className="stat-number" style={{ color: '#34d399' }}>₱{availableCredit.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Active Loans */}
                  <div className="glass-panel">
                    <div className="section-title">
                      <FileText size={20} className="glow-text-cyan" />
                      <h3>Your Outstanding Loans</h3>
                    </div>

                    {loans.filter(l => l.status === 'active').length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                        <p>No active loans. Click below to apply for a loan.</p>
                        <button className="btn btn-accent" style={{ marginTop: '1rem' }} onClick={() => setCurrentTab('apply')}>
                          <Plus size={18} /> Apply For A Loan
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {loans.filter(l => l.status === 'active').map(loan => {
                          const percentPaid = Math.round((loan.total_paid / loan.total_expected_repayment) * 100) || 0;
                          return (
                            <div key={loan.id} className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem' }}>
                              <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
                                <div>
                                  <h4 style={{ fontSize: '1.1rem' }}>₱{loan.amount.toLocaleString()} ({loan.calculation_type.toUpperCase()})</h4>
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Approved on: {new Date(loan.approved_at).toLocaleDateString()} | Rate: {loan.interest_rate}% | Term: {loan.term_months} mos</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span className="badge badge-active">{loan.status}</span>
                                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '0.25rem' }}>Monthly: ₱{loan.monthly_payment.toLocaleString()}</p>
                                </div>
                              </div>

                              <div style={{ marginBottom: '1rem' }}>
                                <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  <span>Paid: ₱{loan.total_paid.toLocaleString()}</span>
                                  <span>Outstanding: ₱{loan.outstanding_balance.toLocaleString()} ({percentPaid}% paid)</span>
                                </div>
                                <div className="progress-track">
                                  <div className="progress-fill progress-fill-cyan" style={{ width: `${percentPaid}%` }}></div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button 
                                  className="btn btn-accent"
                                  onClick={() => {
                                    setActiveRepayLoan(loan);
                                    setShowRepayModal(true);
                                  }}
                                >
                                  Record Manual Payment
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Calculator & Pending applications */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Live Calculator */}
                  <div className="glass-panel">
                    <div className="section-title">
                      <Calculator size={20} className="glow-text-purple" />
                      <h3>Repayment Calculator</h3>
                    </div>
                    
                    <div className="form-group">
                      <label>Principal Amount: ₱{calcForm.amount.toLocaleString()}</label>
                      <input 
                        type="range" 
                        min="5000" 
                        max="150000" 
                        step="5000"
                        value={calcForm.amount}
                        onChange={(e) => setCalcForm({ ...calcForm, amount: parseInt(e.target.value) })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Annual Interest Rate: {calcForm.rate}%</label>
                      <input 
                        type="range" 
                        min="1" 
                        max="24" 
                        step="0.5"
                        value={calcForm.rate}
                        onChange={(e) => setCalcForm({ ...calcForm, rate: parseFloat(e.target.value) })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Term: {calcForm.term} Months</label>
                      <select 
                        value={calcForm.term}
                        onChange={(e) => setCalcForm({ ...calcForm, term: parseInt(e.target.value) })}
                      >
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">12 Months</option>
                        <option value="24">24 Months</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Interest model</label>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="calcType" 
                            value="amortization" 
                            checked={calcForm.type === 'amortization'}
                            onChange={(e) => setCalcForm({ ...calcForm, type: e.target.value })}
                          />
                          Amortized (Fixed Monthly)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="calcType" 
                            value="flat" 
                            checked={calcForm.type === 'flat'}
                            onChange={(e) => setCalcForm({ ...calcForm, type: e.target.value })}
                          />
                          Flat Rate
                        </label>
                      </div>
                    </div>

                    <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Monthly Payment</span>
                        <span className="glow-text-cyan" style={{ fontWeight: 800, fontSize: '1.25rem' }}>₱{calcResult.monthly.toLocaleString()}</span>
                      </div>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Interest Charge</span>
                        <span style={{ fontWeight: 600 }}>₱{calcResult.interest.toLocaleString()}</span>
                      </div>
                      <div className="flex-between" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Total Repayment</span>
                        <span style={{ fontWeight: 700 }}>₱{calcResult.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending applications list */}
                  <div className="glass-panel">
                    <div className="section-title">
                      <Clock size={20} className="glow-text-cyan" />
                      <h3>Pending Applications</h3>
                    </div>

                    {loans.filter(l => l.status === 'pending' || l.status === 'rejected').length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>No pending applications.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {loans.filter(l => l.status === 'pending' || l.status === 'rejected').map(loan => (
                          <div key={loan.id} className="flex-between" style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                              <p style={{ fontWeight: 600 }}>₱{loan.amount.toLocaleString()}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{loan.term_months} mos | {loan.interest_rate}% | {loan.calculation_type}</p>
                            </div>
                            <div>
                              <span className={`badge ${loan.status === 'pending' ? 'badge-pending' : 'badge-rejected'}`}>{loan.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* Borrower Application Form */}
            {currentTab === 'apply' && (
              <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="section-title">
                  <Plus size={24} className="glow-text-cyan" />
                  <h3>Apply for Budget Support</h3>
                </div>
                <p className="sub-header" style={{ marginBottom: '2rem' }}>Need extra funds for personal or business expenses? Let Tito Jayson help support your budget needs. Your application is bounded by your credit limit of <strong>₱{user.credit_limit.toLocaleString()}</strong>.</p>

                <form onSubmit={handleApplyLoan}>
                  <div className="form-group">
                    <label>Loan Principal (PHP)</label>
                    <input 
                      type="number" 
                      min="5000" 
                      max="150000"
                      value={applyForm.amount}
                      onChange={(e) => setApplyForm({ ...applyForm, amount: parseFloat(e.target.value) })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Interest Rate (% Per Annum)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="1" 
                      max="24"
                      value={applyForm.rate}
                      onChange={(e) => setApplyForm({ ...applyForm, rate: parseFloat(e.target.value) })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Term Duration</label>
                    <select 
                      value={applyForm.term}
                      onChange={(e) => setApplyForm({ ...applyForm, term: parseInt(e.target.value) })}
                    >
                      <option value="3">3 Months</option>
                      <option value="6">6 Months</option>
                      <option value="12">12 Months</option>
                      <option value="24">24 Months</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '2rem' }}>
                    <label>Calculation Model</label>
                    <select 
                      value={applyForm.type}
                      onChange={(e) => setApplyForm({ ...applyForm, type: e.target.value })}
                    >
                      <option value="amortization">Amortized (Fixed Monthly Installment)</option>
                      <option value="flat">Flat Rate (Constant Interest accrual)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-accent full-width" disabled={loading}>
                    {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Submit Application'}
                  </button>
                </form>
              </div>
            )}

            {/* Borrower History Log */}
            {currentTab === 'history' && (
              <div className="glass-panel">
                <div className="section-title">
                  <List size={22} className="glow-text-cyan" />
                  <h3>Account Transaction History</h3>
                </div>

                <div className="table-container">
                  {transactions.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No transactions found.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Transaction ID</th>
                          <th>Loan Ref ID</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map(tx => (
                          <tr key={tx.id}>
                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>TX-{tx.id.toString().padStart(5, '0')}</td>
                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>LN-{tx.loan_id ? tx.loan_id.toString().padStart(5, '0') : 'N/A'}</td>
                            <td>
                              <span className={`badge ${tx.type === 'disbursement' ? 'badge-active' : 'badge-paid'}`}>
                                {tx.type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: tx.type === 'disbursement' ? '#34d399' : '#f43f5e' }}>
                              {tx.type === 'disbursement' ? '+' : '-'} ₱{tx.amount.toLocaleString()}
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>{new Date(tx.date).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================
            ADMIN VIEW 
           ======================================================== */}
        {user?.role === 'admin' && adminStats && (
          <>
            {currentTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Stats Row */}
                <div className="dashboard-grid">
                  <div className="glass-panel stat-card glass-panel-glow-purple">
                    <div className="stat-icon stat-icon-purple">
                      <DollarSign size={24} />
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>TOTAL PORTFOLIO DISBURSED</p>
                      <p className="stat-number">₱{adminStats.total_portfolio.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="glass-panel stat-card glass-panel-glow-cyan">
                    <div className="stat-icon stat-icon-cyan">
                      <ArrowUpRight size={24} />
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>OUTSTANDING PORTFOLIO</p>
                      <p className="stat-number" style={{ color: '#06b6d4' }}>₱{adminStats.outstanding_balance.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="glass-panel stat-card glass-panel-glow-cyan">
                    <div className="stat-icon stat-icon-emerald">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>INTEREST YIELD EXPECTED</p>
                      <p className="stat-number" style={{ color: '#34d399' }}>₱{adminStats.total_interest_expected.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="glass-panel stat-card glass-panel-glow-purple">
                    <div className="stat-icon stat-icon-purple">
                      <Users size={24} />
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>COLLECTIONS RATE</p>
                      <p className="stat-number" style={{ color: 'var(--primary-hover)' }}>{adminStats.collection_rate}%</p>
                    </div>
                  </div>
                </div>

                <div className="main-grid">
                  
                  {/* Left Side: Active/Processing Loan Queue */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Pending Loan Queue */}
                    <div className="glass-panel">
                      <div className="section-title">
                        <Clock size={20} className="glow-text-purple" />
                        <h3>Pending Review Queue ({adminStats.pending_loans})</h3>
                      </div>

                      {loans.filter(l => l.status === 'pending').length === 0 ? (
                        <p style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No applications are currently awaiting review.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {loans.filter(l => l.status === 'pending').map(loan => (
                            <div key={loan.id} className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem' }}>
                              <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                <div>
                                  <h4 style={{ fontSize: '1.1rem' }}>{loan.borrower_name}</h4>
                                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{loan.borrower_email}</p>
                                </div>
                                <span className="badge badge-pending">{loan.status}</span>
                              </div>

                              <div className="dashboard-grid" style={{ marginBottom: '1.25rem', gap: '1rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PRINCIPAL</span>
                                  <p style={{ fontWeight: 700 }}>₱{loan.amount.toLocaleString()}</p>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>INTEREST</span>
                                  <p style={{ fontWeight: 700 }}>{loan.interest_rate}% ({loan.calculation_type})</p>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TERM</span>
                                  <p style={{ fontWeight: 700 }}>{loan.term_months} Months</p>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button className="btn btn-danger" onClick={() => handleRejectLoan(loan.id)}>
                                  <XCircle size={16} /> Decline
                                </button>
                                <button className="btn btn-accent" onClick={() => handleApproveLoan(loan.id)}>
                                  <CheckCircle size={16} /> Approve & Disburse
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active Loans Ledger */}
                    <div className="glass-panel">
                      <div className="section-title">
                        <FileText size={20} className="glow-text-cyan" />
                        <h3>Lending ledger (Active & Paid)</h3>
                      </div>

                      <div className="table-container">
                        {loans.filter(l => l.status !== 'pending' && l.status !== 'rejected').length === 0 ? (
                          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No records found.</p>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>Borrower</th>
                                <th>Principal</th>
                                <th>Remaining</th>
                                <th>Paid</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loans.filter(l => l.status !== 'pending' && l.status !== 'rejected').map(loan => (
                                <tr key={loan.id}>
                                  <td>
                                    <p style={{ fontWeight: 600 }}>{loan.borrower_name}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>LN-{loan.id.toString().padStart(5, '0')}</p>
                                  </td>
                                  <td>₱{loan.amount.toLocaleString()}</td>
                                  <td style={{ fontWeight: 600, color: loan.status === 'paid' ? '#34d399' : '#f43f5e' }}>
                                    ₱{loan.outstanding_balance.toLocaleString()}
                                  </td>
                                  <td>₱{loan.total_paid.toLocaleString()}</td>
                                  <td>
                                    <span className={`badge ${loan.status === 'paid' ? 'badge-paid' : 'badge-active'}`}>
                                      {loan.status}
                                    </span>
                                  </td>
                                  <td>
                                    <button 
                                      className="btn btn-secondary btn-icon"
                                      onClick={async () => {
                                        try {
                                          const details = await apiFetch(`/loans/${loan.id}`);
                                          setActiveRepayLoan(details); // Opens detailed list of payments
                                          setShowRepayModal(true);
                                        } catch (e) {
                                          setError(e.message);
                                        }
                                      }}
                                    >
                                      <Eye size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Global Transactions logs */}
                  <div className="glass-panel">
                    <div className="section-title">
                      <List size={20} className="glow-text-cyan" />
                      <h3>Global Transaction Log</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                      {transactions.map(tx => (
                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justify: 'center', width: 36, height: 36, borderRadius: '8px', background: tx.type === 'disbursement' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: tx.type === 'disbursement' ? '#34d399' : '#f43f5e' }}>
                            {tx.type === 'disbursement' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tx.borrower_name}</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.type.toUpperCase()} | {new Date(tx.date).toLocaleDateString()}</p>
                          </div>
                          <p style={{ fontWeight: 700, fontSize: '0.95rem', color: tx.type === 'disbursement' ? '#34d399' : '#f43f5e' }}>
                            ₱{tx.amount.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Admin view: Users management */}
            {currentTab === 'users' && (
              <div className="glass-panel">
                <div className="section-title">
                  <Users size={22} className="glow-text-purple" />
                  <h3>Registered Borrowers Registry</h3>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Registered Date</th>
                        <th>Current Credit Limit</th>
                        <th>Limit Controls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.filter(u => u.role !== 'admin').map(borrower => (
                        <tr key={borrower.id}>
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>USR-{borrower.id.toString().padStart(4, '0')}</td>
                          <td style={{ fontWeight: 600 }}>{borrower.name}</td>
                          <td>{borrower.email}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{new Date(borrower.created_at).toLocaleDateString()}</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>₱{borrower.credit_limit.toLocaleString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input 
                                type="number" 
                                step="5000" 
                                style={{ width: '120px', padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
                                defaultValue={borrower.credit_limit}
                                onBlur={(e) => {
                                  if (e.target.value !== borrower.credit_limit.toString()) {
                                    handleUpdateCreditLimit(borrower.id, e.target.value);
                                  }
                                }}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PHP</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* ========================================================
          MODAL: Manual Repayment Submission (Borrower) / Receipt Details (Admin)
         ======================================================== */}
      {showRepayModal && activeRepayLoan && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="flex-between" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3>
                {user.role === 'admin' 
                  ? `Loan LN-${activeRepayLoan.id.toString().padStart(5, '0')} Details` 
                  : `Record Manual Repayment`
                }
              </h3>
              <button 
                style={{ background: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', fontWeight: 300, cursor: 'pointer' }}
                onClick={() => {
                  setShowRepayModal(false);
                  setActiveRepayLoan(null);
                }}
              >
                &times;
              </button>
            </div>

            {/* Borrower modal content - Submit repayment */}
            {user.role === 'user' && (
              <form onSubmit={handleRepayment}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
                  <div className="flex-between" style={{ fontSize: '0.9rem' }}>
                    <span>Loan Principal:</span>
                    <strong>₱{activeRepayLoan.amount.toLocaleString()}</strong>
                  </div>
                  <div className="flex-between" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    <span>Remaining Balance:</span>
                    <strong style={{ color: '#f43f5e' }}>₱{activeRepayLoan.outstanding_balance.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label>Payment Amount (PHP)</label>
                  <input 
                    type="number" 
                    min="100" 
                    max={activeRepayLoan.outstanding_balance} 
                    value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                    placeholder={`e.g. ${activeRepayLoan.monthly_payment}`}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Upload Screenshot Receipt (JPG/PNG)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleFileChange}
                        id="receipt-file-input"
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="receipt-file-input" className="btn btn-secondary btn-icon" style={{ cursor: 'pointer', textTransform: 'none' }}>
                        <Upload size={16} /> Choose Image
                      </label>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {repayForm.receiptImage ? 'Image uploaded' : 'No file chosen'}
                      </span>
                    </div>
                    {repayForm.receiptImage && (
                      <img src={repayForm.receiptImage} alt="Receipt preview" className="receipt-preview" />
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label>Notes / Reference Number</label>
                  <textarea 
                    rows="2"
                    placeholder="Provide reference number or notes..."
                    value={repayForm.notes}
                    onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn btn-accent full-width" disabled={loading}>
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Record Repayment'}
                </button>
              </form>
            )}

            {/* Admin modal content - View history of repayments & screenshots */}
            {user.role === 'admin' && (
              <div>
                <div className="dashboard-grid" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL REPAYMENT</span>
                    <p style={{ fontWeight: 700 }}>₱{activeRepayLoan.total_expected_repayment.toLocaleString()}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL PAID</span>
                    <p style={{ fontWeight: 700, color: '#34d399' }}>₱{activeRepayLoan.total_paid.toLocaleString()}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OUTSTANDING</span>
                    <p style={{ fontWeight: 700, color: '#f43f5e' }}>₱{activeRepayLoan.outstanding_balance.toLocaleString()}</p>
                  </div>
                </div>

                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Payment Collection History</h4>
                {activeRepayLoan.payments && activeRepayLoan.payments.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-secondary)' }}>No payments registered for this loan yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxH: '250px', overflowY: 'auto' }}>
                    {activeRepayLoan.payments?.map(payment => (
                      <div key={payment.id} className="flex-between" style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div>
                          <p style={{ fontWeight: 700 }}>₱{payment.amount.toLocaleString()}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(payment.payment_date).toLocaleString()}</p>
                          {payment.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>📝 {payment.notes}</p>}
                        </div>
                        {payment.receipt_image && (
                          <img 
                            src={payment.receipt_image} 
                            alt="Receipt" 
                            className="thumbnail-receipt" 
                            onClick={() => {
                              setActiveReceiptUrl(payment.receipt_image);
                              setShowReceiptModal(true);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: Fullsize Receipt Image Preview
         ======================================================== */}
      {showReceiptModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '650px', background: 'rgba(15, 23, 42, 0.95)' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3>Uploaded Screenshot Receipt</h3>
              <button 
                style={{ background: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', fontWeight: 300, cursor: 'pointer' }}
                onClick={() => {
                  setShowReceiptModal(false);
                  setActiveReceiptUrl('');
                }}
              >
                &times;
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <img src={activeReceiptUrl} alt="Receipt Fullscreen" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
