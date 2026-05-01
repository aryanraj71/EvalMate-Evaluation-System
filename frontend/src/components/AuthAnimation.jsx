import React, { useState, useEffect } from 'react';
import './AuthAnimation.css';

export default function AuthAnimation() {
  const [isGrading, setIsGrading] = useState(false);

  useEffect(() => {
    // 4 second cycle for the animation
    const interval = setInterval(() => {
      setIsGrading(false);
      // Cursor clicks at 1.8s
      setTimeout(() => setIsGrading(true), 1800);
    }, 4000);
    
    // Initial trigger
    setTimeout(() => setIsGrading(true), 1800);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="auth-anim-wrapper">
      <div className="auth-dashboard">
        
        {/* Sidebar */}
        <div className="dash-sidebar">
          <div className="dash-logo" />
          <div className="dash-sidebar-item active" style={{ width: '80%', marginTop: '20px' }} />
          <div className="dash-sidebar-item" style={{ width: '60%' }} />
          <div className="dash-sidebar-item" style={{ width: '70%' }} />
          <div className="dash-sidebar-item" style={{ width: '50%' }} />
        </div>

        {/* Main Content */}
        <div className="dash-main">
          <div className="dash-header">
            <div className="dash-title" />
            <div className="dash-btn" />
          </div>

          <div className="dash-content">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`dash-row ${isGrading ? 'graded' : ''}`} style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className="dash-avatar" />
                <div className="dash-line" style={{ transitionDelay: `${i * 0.1}s` }} />
                <div className="dash-score" style={{ transitionDelay: `${i * 0.1}s` }} />
              </div>
            ))}
          </div>
        </div>

        {/* SVG Cursor simulating Professor's mouse */}
        <svg className="dash-cursor" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51L4 4z" fill="#fff"/>
        </svg>

        {/* 3D Floating Badges popping out of the dashboard */}
        <div className={`float-badge badge-1 ${isGrading ? 'show' : ''}`}>
          <div className="check-icon" /> Evaluated
        </div>
        <div className={`float-badge badge-2 ${isGrading ? 'show' : ''}`}>
          <span className="plus-badge">A+</span> 95/100
        </div>
        <div className={`float-badge badge-3 ${isGrading ? 'show' : ''}`}>
          Time Saved: 4hrs
        </div>

      </div>
    </div>
  );
}
