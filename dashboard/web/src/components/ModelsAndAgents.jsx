import React, { useEffect, useState } from 'react';
import ModelSelect from './ModelSelect';
import './ModelsAndAgents.css';

const ROLE_ORDER = ['default', 'smol', 'slow', 'vision', 'plan', 'designer', 'commit', 'tiny', 'task', 'advisor'];

function RoleRow({ role, models, modelRoles, onRoleChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (model) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/model-roles/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      onRoleChange(role, model);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="models-agents-row">
      <td className="models-agents-label">{role}</td>
      <td className="models-agents-control">
        <ModelSelect
          models={models}
          value={modelRoles[role] || ''}
          onChange={handleChange}
          allowInherit={false}
          disabled={saving}
        />
        {saving && <span className="models-agents-spinner">…</span>}
        {error && <span className="models-agents-error">{error}</span>}
      </td>
    </tr>
  );
}

function AgentRow({ agent, models, agentOverrides, onAgentChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (model) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent-model-overrides/${agent.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      onAgentChange(agent.name, model);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="models-agents-row">
      <td className="models-agents-agent-col">
        <div className="models-agents-agent-name">{agent.name}</div>
        <span className={`models-agents-badge models-agents-badge-${agent.source}`}>
          {agent.source}
        </span>
      </td>
      <td className="models-agents-description">{agent.description}</td>
      <td className="models-agents-control">
        <ModelSelect
          models={models}
          value={agentOverrides[agent.name] ?? ''}
          onChange={handleChange}
          allowInherit
          disabled={saving}
        />
        {saving && <span className="models-agents-spinner">…</span>}
        {error && <span className="models-agents-error">{error}</span>}
      </td>
    </tr>
  );
}

export default function ModelsAndAgents() {
  const [models, setModels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [modelRoles, setModelRoles] = useState({});
  const [agentOverrides, setAgentOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [modelsResp, agentsResp, rolesResp, overridesResp] = await Promise.all([
          fetch('/api/models'),
          fetch('/api/agents'),
          fetch('/api/model-roles'),
          fetch('/api/agent-model-overrides')
        ]);

        const modelsData = await modelsResp.json();
        const agentsData = await agentsResp.json();
        const rolesData = await rolesResp.json();
        const overridesData = await overridesResp.json();

        // Defensive parsing
        setModels(Array.isArray(modelsData) ? modelsData : []);
        setAgents(Array.isArray(agentsData) ? agentsData : []);
        setModelRoles(rolesData && typeof rolesData === 'object' && !Array.isArray(rolesData) ? rolesData : {});
        setAgentOverrides(overridesData && typeof overridesData === 'object' && !Array.isArray(overridesData) ? overridesData : {});
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const handleRoleChange = (role, model) => {
    setModelRoles(prev => ({ ...prev, [role]: model }));
  };

  const handleAgentChange = (agentName, model) => {
    setAgentOverrides(prev => {
      const next = { ...prev };
      if (model) {
        next[agentName] = model;
      } else {
        delete next[agentName];
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="models-agents">
        <p className="models-agents-loading">Loading configuration…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="models-agents">
        <p className="models-agents-error-message">Error loading configuration: {error}</p>
      </div>
    );
  }

  return (
    <div className="models-agents">
      <section className="models-agents-section">
        <h3>Model Roles</h3>
        <div className="models-agents-table-wrap">
          <table className="models-agents-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.map(role => (
                <RoleRow
                  key={role}
                  role={role}
                  models={models}
                  modelRoles={modelRoles}
                  onRoleChange={handleRoleChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="models-agents-section">
        <h3>Agent Model Overrides</h3>
        <div className="models-agents-table-wrap">
          <table className="models-agents-table agents-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Description</th>
                <th>Model Override</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <AgentRow
                  key={agent.name}
                  agent={agent}
                  models={models}
                  agentOverrides={agentOverrides}
                  onAgentChange={handleAgentChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
