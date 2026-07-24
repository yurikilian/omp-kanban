import React, { useState } from 'react';
import './Accordion.css';

export default function Accordion({ title, count, children, onToggle, nested = false, badge }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (onToggle) onToggle(next);
  };

  return (
    <div className={`accordion ${nested ? 'accordion-nested' : ''}`}>
      <button
        className={`accordion-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleClick}
        aria-expanded={isOpen}
      >
        <span className="accordion-icon">▶</span>
        <span className="accordion-title">
          {title} {count !== undefined && `(${count})`}
        </span>
        {badge && <span className="accordion-badge">{badge}</span>}
      </button>
      {isOpen && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </div>
  );
}
