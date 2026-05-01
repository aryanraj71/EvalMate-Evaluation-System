import React from 'react';
import { BookOpen } from 'lucide-react';
import './Logo.css';

export default function Logo({ size = 'medium' }) {
  return (
    <div className={`global-brand-logo size-${size}`}>
      <div className="global-brand-icon">
        <BookOpen className="logo-book-icon" />
      </div>
      <span className="global-brand-name">EvalMate</span>
    </div>
  );
}
