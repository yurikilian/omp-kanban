import React, { useEffect, useState, useMemo } from 'react';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import './CommonSettings.css';

export default function CommonSettings() {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loadedValues, setLoadedValues] = useState({});
  const [descriptions, setDescriptions] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [fieldStates, setFieldStates] = useState({});
  const [loadError, setLoadError] = useState(null);

  // Fetch fields and current values on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/omp-config');
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        const data = await res.json();
        const loadedFields = Array.isArray(data.fields) ? data.fields : [];
        const nextValues = data.values && typeof data.values === 'object' ? data.values : {};
        const nextDescriptions = data.descriptions && typeof data.descriptions === 'object' ? data.descriptions : {};
        const nextSuggestions = data.suggestions && typeof data.suggestions === 'object' ? data.suggestions : {};
        setFields(loadedFields);
        setValues(nextValues);
        setLoadedValues(nextValues);
        setDescriptions(nextDescriptions);
        setSuggestions(nextSuggestions);
        setLoadError(null);
      } catch (error) {
        setLoadError(error.message);
        setFields([]);
        setValues({});
        setLoadedValues({});
        setDescriptions({});
        setSuggestions({});
      }
    };
    loadConfig();
  }, []);

  // Group fields by group, preserving order
  const groupedFields = useMemo(() => {
    const groups = [];
    const seen = new Set();
    for (const field of fields) {
      if (!seen.has(field.group)) {
        groups.push({ group: field.group, fields: [] });
        seen.add(field.group);
      }
    }
    for (const field of fields) {
      const groupItem = groups.find((g) => g.group === field.group);
      if (groupItem) groupItem.fields.push(field);
    }
    return groups;
  }, [fields]);

  const updateValue = async (key, newValue) => {
    setFieldStates((prev) => ({ ...prev, [key]: { ...prev[key], saving: true, error: null } }));
    try {
      const res = await fetch(`/api/omp-config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setValues((prev) => ({ ...prev, [key]: data.value }));
      setFieldStates((prev) => ({ ...prev, [key]: { saving: false, error: null } }));
    } catch (error) {
      setFieldStates((prev) => ({ ...prev, [key]: { saving: false, error: error.message } }));
      // Keep the last-known-good value displayed
    }
  };

  const resetValue = async (key) => {
    setFieldStates((prev) => ({ ...prev, [key]: { ...prev[key], saving: true, error: null } }));
    try {
      const res = await fetch(`/api/omp-config/${key}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setValues((prev) => ({ ...prev, [key]: data.value }));
      setLoadedValues((prev) => ({ ...prev, [key]: data.value }));
      setFieldStates((prev) => ({ ...prev, [key]: { saving: false, error: null } }));
    } catch (error) {
      setFieldStates((prev) => ({ ...prev, [key]: { saving: false, error: error.message } }));
    }
  };

  if (loadError) {
    return (
      <div className="common-settings">
        <div className="common-settings-header">
          <h2>Settings</h2>
          <p>Configure OMP runtime behavior.</p>
        </div>
        <div className="common-settings-error">
          Error loading settings: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="common-settings">
      <div className="common-settings-header">
        <h2>Settings</h2>
        <p>Configure OMP runtime behavior.</p>
      </div>

      {groupedFields.map((groupItem) => (
        <section key={groupItem.group} className="common-settings-section">
          <h3>{groupItem.group}</h3>
          <div className="common-settings-fields">
            {groupItem.fields.map((field) => {
              const currentValue = values[field.key];
              const state = fieldStates[field.key] || {};
              const isModified = values[field.key] !== loadedValues[field.key];
              const help = field.help || descriptions[field.key];
              const fieldSuggestions = suggestions[field.key] || [];
              const showHint =
                field.type === 'combobox' &&
                currentValue &&
                String(currentValue).trim() !== '' &&
                !fieldSuggestions.includes(currentValue);
              return (
                <div key={field.key} className="field-row">
                  <label className="field-label">
                    {field.label}
                    {isModified && (
                      <span className="field-modified" title="Changed since load">●</span>
                    )}
                  </label>
                  {help && <span className="field-help">{help}</span>}
                  <div className="field-control-wrapper">
                    {field.type === 'boolean' && (
                      <label className="field-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(currentValue)}
                          onChange={(e) => updateValue(field.key, e.target.checked)}
                          disabled={state.saving}
                          className="field-toggle-input"
                        />
                        <span className="field-toggle-slider" />
                      </label>
                    )}
                    {field.type === 'enum' && (
                      <select
                        value={currentValue ?? ''}
                        onChange={(e) => updateValue(field.key, e.target.value)}
                        disabled={state.saving}
                        className="field-control field-control-select"
                      >
                        {field.enumValues?.map((val) => (
                          <option key={val} value={val}>{val}</option>
                        ))}
                      </select>
                    )}
                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={currentValue ?? ''}
                        onChange={(e) => {
                          // Update local state immediately for responsiveness
                          setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
                        }}
                        onBlur={(e) => {
                          const numValue = Number(e.target.value);
                          updateValue(field.key, numValue);
                        }}
                        disabled={state.saving}
                        className="field-control field-control-input"
                      />
                    )}
                    {field.type === 'string' && (
                      <input
                        type="text"
                        value={currentValue ?? ''}
                        onChange={(e) => {
                          // Update local state immediately for responsiveness
                          setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
                        }}
                        onBlur={(e) => {
                          updateValue(field.key, e.target.value);
                        }}
                        disabled={state.saving}
                        className="field-control field-control-input"
                      />
                    )}
                    {field.type === 'combobox' && (
                      <>
                        <input
                          type="text"
                          value={currentValue ?? ''}
                          list={`dl-${field.key}`}
                          onChange={(e) => {
                            // Update local state immediately for responsiveness
                            setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
                          }}
                          onBlur={(e) => {
                            updateValue(field.key, e.target.value);
                          }}
                          disabled={state.saving}
                          className="field-control field-control-input"
                        />
                        <datalist id={`dl-${field.key}`}>
                          {fieldSuggestions.map((theme) => (
                            <option key={theme} value={theme} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </div>
                  {showHint && (
                    <span className="field-hint">Not a known theme — applied as-is.</span>
                  )}
                  <button
                    onClick={() => resetValue(field.key)}
                    disabled={state.saving}
                    className="field-reset-btn"
                    title="Reset to default"
                  >
                    <ArrowUturnLeftIcon />
                  </button>
                  {state.error && <div className="field-error">{state.error}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
