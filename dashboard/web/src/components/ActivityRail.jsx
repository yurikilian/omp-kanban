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
  // Named and stored for the rail itself: the session sidebar has its own
  // collapse control (SessionList) persisted server-side as `sidebarCollapsed`.
  // Sharing either the accessible name or the key with it made two unrelated
  // preferences indistinguishable.
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('activity-rail-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('activity-rail-collapsed', isCollapsed.toString());
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
        aria-label={isCollapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
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
