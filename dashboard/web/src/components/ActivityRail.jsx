import React from 'react';
import { ChatBubbleLeftRightIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
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
  return (
    <nav className="activity-rail" aria-label="Primary">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`activity-rail-item ${active === section.id ? 'active' : ''}`}
          aria-current={active === section.id ? 'page' : undefined}
          title={section.soon ? `${section.label} (coming soon)` : section.label}
          onClick={() => onSelect(section.id)}
        >
          <section.icon className="activity-rail-icon" aria-hidden="true" />
          {section.soon && <span className="activity-rail-soon">Soon</span>}
        </button>
      ))}
    </nav>
  );
}
