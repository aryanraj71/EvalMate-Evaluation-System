import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../App";
import API from "../services/api";
import { Mail, Lock, User, Briefcase, Building, Eye, EyeOff, ArrowRight, BookOpen, Check } from "lucide-react";

export default function Signup() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", faculty_id: "", department: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await API.post("/auth/signup", formData);
      login(res.data.access_token, res.data.faculty);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { label: "Full Name",      name: "name",        type: "text",     placeholder: "Dr. Jane Smith",          icon: <User size={16} /> },
    { label: "Email Address",  name: "email",       type: "email",    placeholder: "faculty@university.edu",   icon: <Mail size={16} /> },
    { label: "Faculty ID",     name: "faculty_id",  type: "text",     placeholder: "FAC-123",                  icon: <Briefcase size={16} /> },
    { label: "Department",     name: "department",  type: "text",     placeholder: "Computer Science",         icon: <Building size={16} /> },
  ];

  const features = [
    "OCR-powered handwritten answer extraction",
    "Customizable rubrics per question",
    "AI evaluation with confidence scores",
    "Manual review for borderline cases",
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        .signup-root {
          display: flex;
          min-height: 100vh;
          width: 100vw;
          font-family: 'DM Sans', sans-serif;
          background: #0d0f14;
          overflow-x: hidden;
        }

        /* ── LEFT PANEL ── */
        .signup-left {
          flex: 0 0 42%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 40px 48px;
        }
        .signup-left-bg {
          position: absolute; inset: 0;
          background: linear-gradient(160deg, #1a1d2e 0%, #0f1117 100%);
          z-index: 0;
        }
        .su-blob {
          position: absolute; border-radius: 50%;
          filter: blur(90px); z-index: 0;
        }
        .su-blob-1 { width: 380px; height: 380px; background: #4f46e5; opacity: 0.22; top: -80px; left: -80px; }
        .su-blob-2 { width: 280px; height: 280px; background: #7c3aed; opacity: 0.18; bottom: 40px; right: -60px; }
        .su-blob-3 { width: 180px; height: 180px; background: #06b6d4; opacity: 0.12; top: 50%; left: 50%; }
        .signup-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
          z-index: 1;
        }
        .signup-left-inner {
          position: relative; z-index: 2;
          display: flex; flex-direction: column;
          height: 100%;
        }

        .su-brand {
          display: flex; align-items: center; gap: 10px;
        }
        .su-brand-icon {
          width: 38px; height: 38px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: white;
          box-shadow: 0 4px 14px rgba(99,102,241,0.4);
        }
        .su-brand-name {
          font-family: 'Sora', sans-serif;
          font-size: 1.3rem; font-weight: 700;
          color: white; letter-spacing: -0.02em;
        }

        .su-hero {
          flex: 1;
          display: flex; flex-direction: column;
          justify-content: center;
          padding: 0 0 20px;
        }
        .su-step-tag {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.3);
          color: #6ee7b7;
          font-size: 0.72rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 5px 12px; border-radius: 99px;
          margin-bottom: 22px; width: fit-content;
        }
        .su-step-dot {
          width: 6px; height: 6px;
          background: #10b981; border-radius: 50%;
          animation: su-pulse 2s infinite;
        }
        @keyframes su-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.5; transform:scale(0.8); }
        }

        .su-title {
          font-family: 'Sora', sans-serif;
          font-size: clamp(1.8rem, 3vw, 2.5rem);
          font-weight: 800;
          line-height: 1.18;
          color: white;
          margin-bottom: 16px;
          letter-spacing: -0.03em;
        }
        .su-title span {
          background: linear-gradient(90deg, #6ee7b7, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .su-sub {
          color: rgba(255,255,255,0.45);
          font-size: 0.9rem; line-height: 1.65;
          max-width: 380px; margin-bottom: 32px;
        }

        .feature-list {
          display: flex; flex-direction: column; gap: 12px;
        }
        .feature-item {
          display: flex; align-items: center; gap: 12px;
        }
        .feature-check {
          width: 24px; height: 24px; flex-shrink: 0;
          background: rgba(16,185,129,0.2);
          border: 1px solid rgba(16,185,129,0.35);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #34d399;
        }
        .feature-text {
          font-size: 0.88rem; color: rgba(255,255,255,0.7); font-weight: 500;
        }

        .su-footer {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.22);
        }

        /* ── RIGHT PANEL ── */
        .signup-right {
          flex: 1;
          background: #f9fafb;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px 48px;
          overflow-y: auto;
        }

        .su-form-box {
          width: 100%;
          max-width: 420px;
          padding-top: 8px;
        }

        .su-form-heading {
          font-family: 'Sora', sans-serif;
          font-size: 1.7rem; font-weight: 700;
          color: #0f172a; margin-bottom: 5px;
          letter-spacing: -0.03em;
        }
        .su-form-sub {
          font-size: 0.87rem; color: #64748b; margin-bottom: 26px;
        }

        .su-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .su-field-group { margin-bottom: 14px; }
        .su-field-label {
          display: block;
          font-size: 0.75rem; font-weight: 600;
          color: #374151; margin-bottom: 5px;
          letter-spacing: 0.01em; text-transform: uppercase;
        }
        .su-field-wrap { position: relative; }
        .su-field-icon {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%); color: #94a3b8; display: flex;
        }
        .su-field-input {
          width: 100%; box-sizing: border-box;
          padding: 0 13px 0 38px;
          height: 42px;
          border: 1.5px solid #e2e8f0;
          border-radius: 9px;
          font-size: 0.88rem;
          font-family: 'DM Sans', sans-serif;
          color: #0f172a; background: white; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .su-field-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .su-field-input::placeholder { color: #cbd5e1; font-size: 0.85rem; }
        .su-eye-btn {
          position: absolute; right: 11px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94a3b8; padding: 2px; display: flex;
        }

        .su-error-box {
          background: #fef2f2; border: 1px solid #fca5a5;
          color: #b91c1c; padding: 9px 13px;
          border-radius: 8px; font-size: 0.83rem;
          margin-bottom: 14px; font-weight: 500;
        }

        .su-submit-btn {
          width: 100%; height: 44px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white; border: none; border-radius: 9px;
          font-size: 0.92rem; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.2s, transform 0.1s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.3);
          margin-top: 20px;
        }
        .su-submit-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .su-submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .su-switch {
          text-align: center; margin-top: 18px;
          font-size: 0.84rem; color: #64748b;
        }
        .su-switch a {
          color: #6366f1; font-weight: 600;
          text-decoration: none; margin-left: 4px;
        }
        .su-switch a:hover { text-decoration: underline; }

        .su-spinner {
          width: 17px; height: 17px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: su-spin 0.7s linear infinite;
        }
        @keyframes su-spin { to { transform: rotate(360deg); } }

        @media (max-width: 860px) {
          .signup-left { display: none; }
          .signup-right { padding: 32px 24px; }
        }
      `}</style>

      <div className="signup-root">
        {/* LEFT */}
        <div className="signup-left">
          <div className="signup-left-bg" />
          <div className="signup-grid" />
          <div className="su-blob su-blob-1" />
          <div className="su-blob su-blob-2" />
          <div className="su-blob su-blob-3" />

          <div className="signup-left-inner">
            <div className="su-brand">
              <div className="su-brand-icon"><BookOpen size={20} /></div>
              <span className="su-brand-name">EvalMate</span>
            </div>

            <div className="su-hero">
              <div className="su-step-tag">
                <div className="su-step-dot" />
                Faculty Portal
              </div>
              <h1 className="su-title">
                Start evaluating<br />
                with <span>AI precision.</span>
              </h1>
              <p className="su-sub">
                Join hundreds of faculty members who save hours every week
                with automated, rubric-driven grading.
              </p>
              <div className="feature-list">
                {features.map((f, i) => (
                  <div className="feature-item" key={i}>
                    <div className="feature-check"><Check size={13} /></div>
                    <span className="feature-text">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="su-footer">© 2026 EvalMate. All rights reserved.</div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="signup-right">
          <div className="su-form-box">
            <h2 className="su-form-heading">Create account</h2>
            <p className="su-form-sub">Fill in your details to get started with EvalMate</p>

            {error && <div className="su-error-box">{error}</div>}

            <form onSubmit={handleSignup}>
              {/* Name + Email full width */}
              {fields.slice(0, 2).map(f => (
                <div className="su-field-group" key={f.name}>
                  <label className="su-field-label">{f.label}</label>
                  <div className="su-field-wrap">
                    <span className="su-field-icon">{f.icon}</span>
                    <input
                      type={f.type}
                      name={f.name}
                      className="su-field-input"
                      placeholder={f.placeholder}
                      value={formData[f.name]}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              ))}

              {/* Faculty ID + Department side by side */}
              <div className="su-grid-2">
                {fields.slice(2, 4).map(f => (
                  <div className="su-field-group" key={f.name}>
                    <label className="su-field-label">{f.label}</label>
                    <div className="su-field-wrap">
                      <span className="su-field-icon">{f.icon}</span>
                      <input
                        type={f.type}
                        name={f.name}
                        className="su-field-input"
                        placeholder={f.placeholder}
                        value={formData[f.name]}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Password */}
              <div className="su-field-group">
                <label className="su-field-label">Password</label>
                <div className="su-field-wrap">
                  <span className="su-field-icon"><Lock size={16} /></span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="su-field-input"
                    style={{ paddingRight: 38 }}
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                    minLength={6}
                    required
                  />
                  <button type="button" className="su-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="su-submit-btn" disabled={loading}>
                {loading
                  ? <><div className="su-spinner" /> Creating Account…</>
                  : <>Create Account <ArrowRight size={16} /></>
                }
              </button>
            </form>

            <div className="su-switch">
              Already have an account?<Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
