import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const BUILTIN_AGENTS = [
  { name: 'scout', source: 'bundled', description: 'MUST be used for exploratory codebase research, rapid code analysis, and broad pattern searches. Fast read-only scout returning compressed context for handoff.' },
  { name: 'designer', source: 'bundled', description: 'UI/UX specialist for design implementation, review, visual refinement' },
  { name: 'reviewer', source: 'bundled', description: 'Code review specialist for quality/security analysis' },
  { name: 'librarian', source: 'bundled', description: 'Researches external libraries and APIs by reading source code. Returns definitive, source-verified answers.' },
  { name: 'task', source: 'bundled', description: 'General-purpose subagent with full capabilities for delegated multi-step tasks' },
  { name: 'sonic', source: 'bundled', description: 'Low-reasoning agent for strictly mechanical updates or data collection only' }
];

export const DEFAULT_USER_AGENTS_DIR = path.join(os.homedir(), '.omp', 'agent', 'agents');

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  
  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  
  return frontmatter;
}

export async function listCustomAgents(dir = DEFAULT_USER_AGENTS_DIR) {
  try {
    const entries = await fs.readdir(dir);
    const agents = [];
    
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      
      try {
        const filePath = path.join(dir, entry);
        const content = await fs.readFile(filePath, 'utf-8');
        const fm = parseFrontmatter(content);
        
        if (fm.name && fm.description) {
          agents.push({
            name: fm.name,
            source: 'user',
            description: fm.description,
            filePath
          });
        }
      } catch {
        // Skip malformed or unreadable files
      }
    }
    
    return agents;
  } catch {
    // Missing directory = no custom agents, not an error
    return [];
  }
}

export async function listAllAgents(dir = DEFAULT_USER_AGENTS_DIR) {
  const custom = await listCustomAgents(dir);
  const customNames = new Set(custom.map(a => a.name));
  const builtin = BUILTIN_AGENTS.filter(a => !customNames.has(a.name));
  return [...custom, ...builtin];
}
