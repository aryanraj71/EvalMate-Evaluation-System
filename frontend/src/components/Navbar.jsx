import React, { useContext, useState, useEffect, useRef } from 'react';
import { Bell, Search, User, LogOut, Menu, FileText, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import API from '../services/api';
import './Navbar.css';

const Navbar = ({ toggleSidebar }) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetched, setFetched] = useState(false);
  const searchRef = useRef(null);

  // Fetch assignments once on mount
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const res = await API.get('/assignments');
        setAllAssignments(res.data);
        setFetched(true);
      } catch (e) { /* silent */ }
    };
    fetchAssignments();
  }, []);

  // Filter on query change
  useEffect(() => {
    if (!query.trim()) { setResults([]); setShowDropdown(false); return; }
    const q = query.toLowerCase();
    const filtered = allAssignments.filter(a =>
      a.assignment_name.toLowerCase().includes(q) ||
      (a.subject && a.subject.toLowerCase().includes(q))
    );
    setResults(filtered);
    setShowDropdown(true);
  }, [query, allAssignments]);

  // Close dropdown on outside click
  useEffect(() => {
    const handle = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const handleSelect = (assignment) => {
    setQuery('');
    setShowDropdown(false);
    navigate(`/assignment/${assignment.id}`);
  };

  const clearSearch = () => { setQuery(''); setShowDropdown(false); };

  return (
    <header className="top-navbar glass-panel">
      <div className="navbar-left">
        <button className="mobile-menu-btn" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <div className="search-bar-wrap" ref={searchRef}>
          <div className={`search-bar ${showDropdown ? 'active' : ''}`}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search assignments..."
              className="search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
            />
            {query && (
              <button className="search-clear-btn" onClick={clearSearch}>
                <X size={15} />
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="search-dropdown">
              {results.length === 0 ? (
                <div className="search-no-results">No assignments match "{query}"</div>
              ) : (
                results.map(a => (
                  <div key={a.id} className="search-result-item" onClick={() => handleSelect(a)}>
                    <div className="search-result-icon"><FileText size={15} /></div>
                    <div className="search-result-text">
                      <span className="search-result-name">{a.assignment_name}</span>
                      <span className="search-result-sub">{a.subject} · {a.maximum_marks} marks</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="navbar-right">
        <button className="icon-btn">
          <Bell size={20} />
          <span className="notification-dot" />
        </button>

        <div className="user-profile">
          <div className="avatar"><User size={18} /></div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className="user-role">{user?.role === 'admin' ? 'Administrator' : 'Instructor'}</span>
          </div>
        </div>

        <button onClick={logout} className="icon-btn logout-btn" title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
