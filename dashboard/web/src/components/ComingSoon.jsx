import React from 'react';
import './ComingSoon.css';

// Honest placeholder for a staked-out but unbuilt section (see ActivityRail).
// Shown full-bleed in place of the sidebar + content columns — neither
// Observability (dashboard-shaped) nor Configurations (form-shaped) belong
// in the session-list-shaped 280px panel, so we don't fake one.
export default function ComingSoon({ icon, title, description }) {
  return (
    <div className="coming-soon">
      {typeof icon === 'string'
        ? <span className="coming-soon-icon">{icon}</span>
        : React.createElement(icon, { className: 'coming-soon-icon', 'aria-hidden': 'true' })}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
