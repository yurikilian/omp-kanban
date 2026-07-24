import React, { useState, useEffect } from 'react';
import { ChatBubbleLeftRightIcon, ChartBarIcon, Cog6ToothIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import './ActivityRail.css';

// Icon-only left rail switching the app's top-level sections. Sessions,
// Observability, and Configurations are all fully built. Starting a new
// chat lives inside the Sessions feature itself (see SessionList's
// "+ New Chat" button).
const SECTIONS = [
  { id: 'sessions', label: 'Sessions', icon: ChatBubbleLeftRightIcon },
  { id: 'observability', label: 'Observability', icon: ChartBarIcon },
  { id: 'configurations', label: 'Configurations', icon: Cog6ToothIcon }
];

export default function ActivityRail({ active, onSelect }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem('sidebar-collapsed');
    return stored === 'true';
  });

  // Persist to localStorage on toggle
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isCollapsed.toString());
  }, [isCollapsed]);

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <nav 
      className={`activity-rail ${isCollapsed ? 'collapsed' : ''}`} 
      aria-label="Primary"
    >
      <button
        type="button"
        className="activity-rail-toggle"
        onClick={handleToggleCollapse}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeftIcon className="activity-rail-toggle-icon" aria-hidden="true" />
      </button>
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`activity-rail-item ${active === section.id ? 'active' : ''}`}
          aria-current={active === section.id ? 'page' : undefined}
          title={section.label}
          onClick={() => onSelect(section.id)}
        >
          <section.icon className="activity-rail-icon" aria-hidden="true" />
          {!isCollapsed && <span className="activity-rail-label">{section.label}</span>}
        </button>
      ))}
    </nav>
  );
}
