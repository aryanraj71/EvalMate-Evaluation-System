import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, PlusSquare, BookOpen, Settings, FolderOpen, BarChart2 } from 'lucide-react';
import './Sidebar.css';
import Logo from './Logo';

const Sidebar = () => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard',          name: 'Dashboard',         icon: Home },
    { path: '/assignments',        name: 'Assignments',        icon: FolderOpen },
    { path: '/results',            name: 'Results',            icon: BarChart2 },
    { path: '/create-assignment',  name: 'Create Assignment',  icon: PlusSquare },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Logo size="medium" />
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-link disabled">
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
