import React from 'react';
import ModelsAndAgents from './ModelsAndAgents';
import CommonSettings from './CommonSettings';
import './Configurations.css';

// Model/agent role assignment and common OMP settings, read from and
// written to the real global ~/.omp/agent/config.yml via the omp CLI
// (see server/src/ompConfig.js — the sole shell-out site).
export default function Configurations() {
  return (
    <div className="configurations">
      <div className="configurations-header">
        <h2>Configurations</h2>
        <p>Model and agent assignment, plus the most common OMP runtime settings.</p>
      </div>
      <section className="configurations-section">
        <ModelsAndAgents />
      </section>
      <section className="configurations-section">
        <CommonSettings />
      </section>
    </div>
  );
}
