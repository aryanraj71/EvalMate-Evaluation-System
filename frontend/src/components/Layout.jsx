import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Footer from './Footer';
import './Layout.css';

const Layout = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    return (
        <div className="layout-container">
            <div className={`sidebar-wrapper ${isSidebarOpen ? 'mobile-open' : ''}`}>
                <Sidebar />
            </div>

            {isSidebarOpen && (
                <div className="mobile-backdrop" onClick={toggleSidebar}></div>
            )}

            <main className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <Navbar toggleSidebar={toggleSidebar} />
                <div className="content-inner" style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
                    {children}
                </div>
                <Footer />
            </main>
        </div>
    );
};

export default Layout;
