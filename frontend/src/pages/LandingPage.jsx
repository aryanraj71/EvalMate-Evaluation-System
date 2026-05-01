import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Brain, FileText, CheckCircle, ChevronRight } from "lucide-react";
import "./LandingPage.css";
import Logo from "../components/Logo";

export default function LandingPage() {
  const navigate = useNavigate();
  const [animationStep, setAnimationStep] = useState(0);

  // Trigger animations in sequence for the Hero section
  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationStep(1), 1000); // 1st score pop
    const timer2 = setTimeout(() => setAnimationStep(2), 1500); // 2nd score pop
    const timer3 = setTimeout(() => setAnimationStep(3), 2000); // 3rd score pop
    const timer4 = setTimeout(() => setAnimationStep(4), 2500); // final popup

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  return (
    <div className="landing-container">
      {/* ── Navbar ── */}
      <nav className="landing-nav">
        <Logo size="medium" />
        <div className="landing-nav-links">
          <Link to="/" className="nav-link active">Home</Link>
          <Link to="/login" className="nav-link">Log in</Link>
        </div>
      </nav>

      {/* ── Hero Section (Magic Scan & Grade) ── */}
      <section className="hero-section">
        <div className="hero-bg-glow"></div>
        <div className="hero-content">
          <h1 className="hero-title">Intelligent Grading,<br />Instant Results.</h1>
          <p className="hero-subtitle">
            Upload student submissions. Let AI deeply analyze and map answers to your specific rubrics with unprecedented accuracy.
          </p>
          <div className="hero-buttons">
            <Link to="/signup" className="btn-glow" style={{ fontSize: "1.1rem", padding: "0.8rem 1.8rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Start Grading Free <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        {/* 3D Visual */}
        <div className="hero-visual">
          <div className="tablet-frame">
            <div className="tablet-screen">

              {/* Scan Area */}
              <div className="scan-area">
                <div className="paper">
                  <div className="paper-line w-75"></div>
                  <div className="paper-line w-full"></div>
                  <div className="paper-line w-full"></div>
                  <div className="paper-line w-50"></div>
                  <div style={{ marginTop: 20 }}></div>
                  <div className="paper-line w-full"></div>
                  <div className="paper-line w-full"></div>
                  <div className="paper-line w-75"></div>
                  <div className="scan-beam"></div>
                  <div className="scan-overlay"></div>
                </div>
              </div>

              {/* Rubric Area */}
              <div className="rubric-area">
                <div className="rubric-item">
                  <div className="rubric-text"></div>
                  <div className={`rubric-score ${animationStep >= 1 ? 'animate-1' : ''}`}>✓</div>
                </div>
                <div className="rubric-item">
                  <div className="rubric-text" style={{ width: '40%' }}></div>
                  <div className={`rubric-score ${animationStep >= 2 ? 'animate-2' : ''}`}>~</div>
                </div>
                <div className="rubric-item">
                  <div className="rubric-text" style={{ width: '80%' }}></div>
                  <div className={`rubric-score ${animationStep >= 3 ? 'animate-3' : ''}`}>✓</div>
                </div>
              </div>

              {/* Final Score Popup */}
              {animationStep >= 4 && (
                <div className="final-score-popup">
                  <div className="final-score-val">92/100</div>
                  <div className="final-score-lbl">Evaluated</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section (Intelligent Rubric Mapping) ── */}
      <section className="features-section">
        <h2 className="section-title">Beyond Keyword Matching</h2>

        <div className="mapping-feature">
          <div className="mapping-text">
            <h3>Intelligent Rubric Mapping</h3>
            <p>
              EvalMate doesn't just look for exact words. Our LLM-powered engine semantically understands student responses, intelligently connecting their ideas directly to your precise rubric criteria.
            </p>
            <ul style={{ listStyle: "none", padding: 0, marginTop: "2rem", color: "var(--landing-text)" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem" }}>
                <CheckCircle size={20} color="var(--landing-success)" /> Deep semantic analysis
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem" }}>
                <CheckCircle size={20} color="var(--landing-success)" /> Context-aware grading
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <CheckCircle size={20} color="var(--landing-success)" /> High confidence scores
              </li>
            </ul>
          </div>

          <div className="mapping-visual">
            {/* Student Answer Nodes */}
            <div className="student-text-node st-1">"The time complexity is O(N log N)"</div>
            <div className="student-text-node st-2">"It divides the array into halves"</div>
            <div className="student-text-node st-3">"Uses a pivot element"</div>

            {/* SVG Lines */}
            <svg className="mapping-lines" preserveAspectRatio="none">
              {/* Path 1 */}
              <path className="mapping-path p1" d="M 190 70 C 300 70, 300 70, 410 70" />
              {/* Path 2 */}
              <path className="mapping-path p2" d="M 190 215 C 300 215, 300 215, 410 215" />
              {/* Path 3 */}
              <path className="mapping-path p3" d="M 190 360 C 300 360, 300 360, 410 360" />
            </svg>

            {/* Particles */}
            <div className="particle pt1"></div>
            <div className="particle pt2"></div>
            <div className="particle pt3"></div>

            {/* Rubric Criteria Nodes */}
            <div className="rubric-criteria-node rc-1">Mentions Time Complexity</div>
            <div className="rubric-criteria-node rc-2">Explains Divide & Conquer</div>
            <div className="rubric-criteria-node rc-3">Identifies Pivot Usage</div>
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section className="how-it-works-section">
        <h2 className="section-title">How It Works</h2>
        <div className="steps-container">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Upload & Map</h3>
            <p>Upload student scripts and define your grading rubric with clear criteria and marks.</p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>AI Evaluation</h3>
            <p>Our advanced LLM engine semantically evaluates each answer against your rubric.</p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Faculty Review</h3>
            <p>Review the AI's suggestions, make adjustments, and finalize grades with full control.</p>
          </div>
        </div>
      </section>

      {/* ── Why EvalMate Section ── */}
      <section className="benefits-section">
        <h2 className="section-title">Why EvalMate?</h2>
        <div className="benefits-grid">
          <div className="benefit-item">
            <div className="benefit-icon"><FileText size={32} /></div>
            <h4>Unmatched Consistency</h4>
            <p>Eliminate grading fatigue. Every paper is graded against the exact same standard, ensuring fairness across the board.</p>
          </div>
          <div className="benefit-item">
            <div className="benefit-icon"><Brain size={32} /></div>
            <h4>Semantic Understanding</h4>
            <p>EvalMate understands context, synonyms, and complex sentence structures, moving far beyond rigid keyword matching.</p>
          </div>
          <div className="benefit-item">
            <div className="benefit-icon"><CheckCircle size={32} /></div>
            <h4>Total Control</h4>
            <p>AI assists, you decide. Low-confidence scores are flagged for your review, keeping you in the driver's seat.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "4rem", textAlign: "center", borderTop: "1px solid var(--landing-border)", color: "var(--landing-muted)" }}>
        <p>© 2026 EvalMate. All rights reserved.</p>
      </footer>
    </div>
  );
}
