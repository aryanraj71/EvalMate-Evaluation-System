import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../App";
import API from "../services/api";
import { Mail, Lock, Eye, EyeOff, ArrowRight, BookOpen, Check, User } from "lucide-react";
import "./LandingPage.css";
import AuthAnimation from "../components/AuthAnimation";
import Logo from "../components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await API.post("/auth/login", { email, password });
      login(res.data.access_token, res.data.faculty);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        .login-root {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          font-family: 'DM Sans', sans-serif;
          background: #f8fafc;
        }

        /* ── LEFT PANEL ── */
        .login-left {
          flex: 1 1 52%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 40px 48px;
        }

        .login-left-bg {
          position: absolute;
          inset: 0;
          background: #f8fafc;
          background-image: radial-gradient(circle at 15% 50%, rgba(124, 58, 237, 0.05), transparent 25%),
                            radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.04), transparent 25%);
          z-index: 0;
        }

        .login-left-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
        }

        .login-hero {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 0 20px;
        }

        .hero-tag {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(124, 58, 237, 0.1);
          border: 1px solid rgba(124, 58, 237, 0.2);
          color: #c4b5fd;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 6px 14px;
          border-radius: 99px;
          margin-bottom: 24px;
          width: fit-content;
        }

        .hero-title {
          font-family: 'Sora', sans-serif;
          font-size: clamp(2rem, 3.5vw, 2.8rem);
          font-weight: 800;
          line-height: 1.15;
          color: #0f172a;
          margin-bottom: 18px;
          letter-spacing: -0.03em;
        }
        .hero-title span {
          background: linear-gradient(90deg, #7c3aed, #9333ea);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-sub {
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.65;
          max-width: 400px;
          margin-bottom: 36px;
        }

        .feature-list {
          margin-top: 30px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .feature-item {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .feature-icon {
          padding: 8px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .feature-text {
          color: #334155;
          font-size: 0.95rem;
          font-weight: 500;
        }

        .left-footer {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        /* ── RIGHT PANEL ── */
        .login-right {
          flex: 0 0 44%;
          background: #f9fafb;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 48px;
          overflow: hidden;
        }

        .form-box {
          width: 100%;
          max-width: 380px;
        }

        .form-heading {
          font-family: 'Sora', sans-serif;
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
          letter-spacing: -0.03em;
        }
        .form-subheading {
          font-size: 0.88rem;
          color: #64748b;
          margin-bottom: 28px;
        }

        .field-label {
          display: block;
          font-size: 0.78rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
          letter-spacing: 0.01em;
          text-transform: uppercase;
        }
        .field-wrap {
          position: relative;
          margin-bottom: 16px;
        }
        .field-icon {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          display: flex;
        }
        .field-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0 14px 0 40px;
          height: 44px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.92rem;
          font-family: 'DM Sans', sans-serif;
          color: #0f172a;
          background: white;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
        .field-input::placeholder { color: #cbd5e1; }
        .eye-btn {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94a3b8; padding: 3px; display: flex;
        }

        .row-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 22px;
          margin-top: -4px;
        }
        .remember-label {
          display: flex; align-items: center; gap: 7px;
          font-size: 0.82rem; color: #64748b; cursor: pointer;
        }
        .forgot-link {
          font-size: 0.82rem; font-weight: 600;
          color: #6366f1; text-decoration: none;
        }
        .forgot-link:hover { text-decoration: underline; }

        .submit-btn {
          width: 100%;
          height: 46px;
          background: #0f172a;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s, transform 0.1s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.35);
          letter-spacing: 0.01em;
        }
        .submit-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .error-box {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #b91c1c;
          padding: 10px 14px;
          border-radius: 9px;
          font-size: 0.84rem;
          margin-bottom: 16px;
          font-weight: 500;
        }

        .switch-link {
          text-align: center;
          margin-top: 20px;
          font-size: 0.85rem;
          color: #64748b;
        }
        .switch-link a {
          color: #6366f1;
          font-weight: 600;
          text-decoration: none;
          margin-left: 4px;
        }
        .switch-link a:hover { text-decoration: underline; }

        .spinner-sm {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .login-left { display: none; }
          .login-right { flex: 1; padding: 32px 24px; }
        }
      `}</style>

      <div className="login-root">
        {/* LEFT */}
        <div className="login-left">
          <div className="login-left-bg" />

          <div className="login-left-content">
            {/* Brand */}
            <Logo size="medium" />

            {/* Hero */}
            <div className="login-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AuthAnimation />
            </div>

            <div className="left-footer">© 2026 EvalMate. All rights reserved.</div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="login-right">
          <div style={{ position: 'absolute', top: '32px', right: '48px', zIndex: 10, display: 'flex', gap: '2rem' }}>
            <Link to="/" style={{ color: '#64748b', fontWeight: 600, textDecoration: 'none', fontSize: '1.05rem', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#7c3aed'} onMouseOut={e => e.target.style.color = '#64748b'}>Home</Link>
            <Link to="/signup" style={{ color: '#64748b', fontWeight: 600, textDecoration: 'none', fontSize: '1.05rem', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#7c3aed'} onMouseOut={e => e.target.style.color = '#64748b'}>Sign up</Link>
          </div>
          <div className="form-box">
            <h2 className="form-heading">Welcome back</h2>
            <p className="form-subheading">Sign in to your account to continue</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleLogin}>
              <div>
                <label className="field-label">Email</label>
                <div className="field-wrap">
                  <span className="field-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    className="field-input"
                    placeholder="faculty@ddn.upes.ac.in"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Password</label>
                <div className="field-wrap">
                  <span className="field-icon"><Lock size={16} /></span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="field-input"
                    style={{ paddingRight: 40 }}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="row-between">
                <label className="remember-label">
                  <input type="checkbox" style={{ accentColor: "#6366f1", width: 14, height: 14 }} />
                  Remember me
                </label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? <><div className="spinner-sm" /> Signing in…</> : <>Sign In <ArrowRight size={16} /></>}
              </button>
            </form>

            <div className="switch-link">
              Don't have an account?<Link to="/signup">Create account</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
