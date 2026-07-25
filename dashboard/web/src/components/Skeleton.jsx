import React from 'react';
import './Skeleton.css';

/**
 * Shared loading placeholder. One `<span className="skeleton">` per `count`,
 * sized by `width`/`height` so callers can stand in for a text line, a block,
 * or a repeated row without each growing its own pulse animation.
 */
export default function Skeleton({ width, height, count = 1, className = '' }) {
  const style = { width, height };
  return Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className={`skeleton ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  ));
}
