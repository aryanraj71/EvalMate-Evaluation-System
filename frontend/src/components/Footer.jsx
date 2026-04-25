import React from 'react';
import './Footer.css';

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-left">
                    <p>&copy; {currentYear} EvalMate. All rights reserved.</p>
                </div>
                <div className="footer-right">
                    <a href="#" className="footer-link">Privacy Policy</a>
                    <span className="footer-divider">&middot;</span>
                    <a href="#" className="footer-link">Terms of Service</a>
                    <span className="footer-divider">&middot;</span>
                    <a href="#" className="footer-link">Support</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
