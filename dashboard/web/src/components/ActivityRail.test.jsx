import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityRail from './ActivityRail';
import fs from 'fs';
import path from 'path';

describe('ActivityRail Component', () => {
  it('renders a button for every section', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    expect(screen.getByTitle('Sessions')).toBeInTheDocument();
    expect(screen.getByTitle('Observability')).toBeInTheDocument();
    expect(screen.getByTitle('Configurations')).toBeInTheDocument();
  });

  it('marks the active section with aria-current', () => {
    render(<ActivityRail active="observability" onSelect={vi.fn()} />);
    expect(screen.getByTitle('Observability')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTitle('Sessions')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the section id when clicked', () => {
    const onSelect = vi.fn();
    render(<ActivityRail active="sessions" onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle('Observability'));
    expect(onSelect).toHaveBeenCalledWith('observability');
  });

  it('shows no "Soon" badges now that every section is built', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    expect(screen.queryAllByText('Soon')).toHaveLength(0);
  });
});

describe('Theme Tokens (E1-S1-AC1)', () => {
  it('defines distinct semantic tokens in theme.css :root', () => {
    // E1-S1-AC1: Verify theme.css has distinct tokens for primary, success, warning, danger, neutral, sidebar-bg
    const themeCssPath = path.join(__dirname, '../theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');
    
    // Check that all semantic tokens are defined
    expect(themeCss).toMatch(/--primary:\s*#0d6efd/);
    expect(themeCss).toMatch(/--success:\s*#198754/);
    expect(themeCss).toMatch(/--warning:\s*#ffc107/);
    expect(themeCss).toMatch(/--danger:\s*#dc3545/);
    expect(themeCss).toMatch(/--neutral:\s*#e8e8e8/);
    expect(themeCss).toMatch(/--sidebar-bg:\s*#1a1a2e/);
    
    // Verify they are separate from --msg-* tokens (should still exist)
    expect(themeCss).toMatch(/--msg-user-border:\s*#0066cc/);
  });
});

describe('ActivityRail Active State (E1-S1-AC2)', () => {
  it('uses --primary token in CSS (no hardcoded hex for active state)', () => {
    // E1-S1-AC2: Verify ActivityRail.css uses var(--primary) not --msg-user-border or hardcoded hex
    const activityRailCssPath = path.join(__dirname, './ActivityRail.css');
    const activityRailCss = fs.readFileSync(activityRailCssPath, 'utf-8');
    
    // Check that active state uses --primary
    expect(activityRailCss).toMatch(/\.activity-rail-item\.active\s*\{[\s\S]*?background:\s*var\(--primary\)/);
    
    // Verify no hardcoded hex in active or focus-visible rules
    const activeBlock = activityRailCss.match(/\.activity-rail-item\.active[\s\S]*?\}/)[0];
    expect(activeBlock).not.toMatch(/#[0-9a-fA-F]{6}/);
    
    // Verify focus-visible also uses --primary
    expect(activityRailCss).toMatch(/\.activity-rail-item:focus-visible[\s\S]*?var\(--primary\)/);
  });

  it('renders active item with active class', () => {
    // E1-S1-AC2: Verify active item renders with correct class
    const { container } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    const activeItem = container.querySelector('.activity-rail-item.active');
    
    expect(activeItem).toBeInTheDocument();
    expect(activeItem).toHaveClass('active');
    expect(activeItem).toHaveTextContent('Sessions');  // Verify it renders with label
  });
});

describe('WCAG AA Contrast (E1-S1-AC3)', () => {
  it('primary blue meets WCAG AA contrast against light background', () => {
    // E1-S1-AC3: Verify that --primary color (from theme.css) has >= 4.5:1 contrast in light mode
    const fs = require('fs');
    const path = require('path');
    const themeCssPath = path.join(__dirname, '../theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');
    
    // Extract light-mode primary color from :root block
    const lightModeMatch = themeCss.match(/:root\s*\{([\s\S]*?)\}[\s\S]*?\[data-theme/);
    expect(lightModeMatch).toBeTruthy();
    const lightModeBlock = lightModeMatch[1];
    
    const primaryMatch = lightModeBlock.match(/--primary\s*:\s*(#[0-9a-fA-F]{6})/);
    expect(primaryMatch).toBeTruthy();
    const primaryHex = primaryMatch[1];
    
    // Helper to parse hex to RGB
    const hexToRGB = (hex) => ({
      r: parseInt(hex.substring(1, 3), 16),
      g: parseInt(hex.substring(3, 5), 16),
      b: parseInt(hex.substring(5, 7), 16)
    });
    
    // Helper to compute luminance and contrast
    const getLuminance = ({ r, g, b }) => {
      const [rs, gs, bs] = [r, g, b].map(x => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    const computeContrast = (rgb1, rgb2) => {
      const l1 = getLuminance(rgb1);
      const l2 = getLuminance(rgb2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    
    const primaryRgb = hexToRGB(primaryHex);
    const lightBgRgb = { r: 255, g: 255, b: 255 };
    const whiteTextRgb = { r: 255, g: 255, b: 255 };
    
    // Calculate contrast ratio for primary background with white text
    const contrast = computeContrast(primaryRgb, whiteTextRgb);
    
    // WCAG AA requires >= 4.5:1 for normal text
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Dark Sidebar with Labels & Feedback (E2-S1)', () => {
  describe('E2-S1-AC1: Labels visible on sidebar', () => {
    it('renders icon + visible text label for Sessions, Observability, Configurations', () => {
      const { container } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      // Verify labels are rendered as text content (not just in title attribute)
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Observability')).toBeInTheDocument();
      expect(screen.getByText('Configurations')).toBeInTheDocument();
      
      // Verify each label is within a button (the section item)
      const sessionBtn = screen.getByRole('button', { name: /sessions/i });
      const obsBtn = screen.getByRole('button', { name: /observability/i });
      const configBtn = screen.getByRole('button', { name: /configurations/i });
      
      expect(sessionBtn).toBeInTheDocument();
      expect(obsBtn).toBeInTheDocument();
      expect(configBtn).toBeInTheDocument();
    });
  });

  describe('E2-S1-AC3: Active section highlighting', () => {
    it('only the active section carries aria-current="page" and the active class', () => {
      const { rerender } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      // Sessions is active
      const sessionBtn = screen.getByRole('button', { name: /sessions/i });
      const obsBtn = screen.getByRole('button', { name: /observability/i });
      const configBtn = screen.getByRole('button', { name: /configurations/i });
      
      expect(sessionBtn).toHaveAttribute('aria-current', 'page');
      expect(sessionBtn).toHaveClass('active');
      
      expect(obsBtn).not.toHaveAttribute('aria-current');
      expect(obsBtn).not.toHaveClass('active');
      
      expect(configBtn).not.toHaveAttribute('aria-current');
      expect(configBtn).not.toHaveClass('active');
      
      // Re-render with observability active
      rerender(<ActivityRail active="observability" onSelect={vi.fn()} />);
      
      expect(sessionBtn).not.toHaveAttribute('aria-current');
      expect(sessionBtn).not.toHaveClass('active');
      
      expect(obsBtn).toHaveAttribute('aria-current', 'page');
      expect(obsBtn).toHaveClass('active');
      
      expect(configBtn).not.toHaveAttribute('aria-current');
      expect(configBtn).not.toHaveClass('active');
    });
  });

  describe('E2-S1-AC2: Hover treatment', () => {
    it('hovering an item applies the hover treatment distinct from resting state', () => {
      // E2-S1-AC2: Verify CSS has distinct hover styles
      const activityRailCssPath = path.join(__dirname, './ActivityRail.css');
      const activityRailCss = fs.readFileSync(activityRailCssPath, 'utf-8');
      
      // Verify hover rule exists and changes background and/or color
      expect(activityRailCss).toMatch(/\.activity-rail-item:hover\s*\{[\s\S]*?background:\s*(rgba|var|#)/);
      expect(activityRailCss).toMatch(/\.activity-rail-item:hover\s*\{[\s\S]*?color:\s*(rgba|var|#|white)/);
      
      // Verify the base item has different background from hover
      const baseRule = activityRailCss.match(/\.activity-rail-item\s*\{[\s\S]*?\}/)[0];
      const hoverRule = activityRailCss.match(/\.activity-rail-item:hover\s*\{[\s\S]*?\}/)[0];
      
      // Base should have background: transparent
      expect(baseRule).toMatch(/background:\s*transparent/);
      // Hover should have different background
      expect(hoverRule).toMatch(/background:\s*rgba/);
    });
  });

  describe('E2-S1-AC4: onSelect callback', () => {
    it('clicking a non-active item calls onSelect with its section id', () => {
      const onSelect = vi.fn();
      render(<ActivityRail active="sessions" onSelect={onSelect} />);
      
      const obsBtn = screen.getByRole('button', { name: /observability/i });
      
      fireEvent.click(obsBtn);
      
      expect(onSelect).toHaveBeenCalledWith('observability');
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Collapse/Expand Toggle with Persistence (E2-S2)', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('E2-S2-AC1: Labels hide when collapsed, rail narrows to icon-only; accessible names retained', () => {
    it('toggle collapses: labels hidden, rail icon-only, each item retains title/aria-label', () => {
      const { container } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      // Find and click toggle button
      const toggleBtn = screen.getByRole('button', { name: /collapse navigation rail/i });
      expect(toggleBtn).toBeInTheDocument();
      
      // Initially, labels should be visible
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Observability')).toBeInTheDocument();
      expect(screen.getByText('Configurations')).toBeInTheDocument();
      
      // Click toggle to collapse
      fireEvent.click(toggleBtn);
      
      // Labels should now be hidden
      expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
      expect(screen.queryByText('Observability')).not.toBeInTheDocument();
      expect(screen.queryByText('Configurations')).not.toBeInTheDocument();
      
      // Rail should have collapsed class
      const rail = container.querySelector('.activity-rail');
      expect(rail).toHaveClass('collapsed');
      
      // Each section button should still retain its title for accessibility
      const sessionBtn = screen.getByTitle('Sessions');
      const obsBtn = screen.getByTitle('Observability');
      const configBtn = screen.getByTitle('Configurations');
      
      expect(sessionBtn).toBeInTheDocument();
      expect(obsBtn).toBeInTheDocument();
      expect(configBtn).toBeInTheDocument();
    });
  });

  describe('E2-S2-AC2: Collapse/expand toggle restores on re-toggle', () => {
    it('toggle again expands: labels reappear and full width restored', () => {
      const { container } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      const toggleBtn = screen.getByRole('button', { name: /collapse navigation rail/i });
      
      // Collapse
      fireEvent.click(toggleBtn);
      expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
      
      // Expand
      fireEvent.click(toggleBtn);
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Observability')).toBeInTheDocument();
      expect(screen.getByText('Configurations')).toBeInTheDocument();
      
      // Rail should not have collapsed class
      const rail = container.querySelector('.activity-rail');
      expect(rail).not.toHaveClass('collapsed');
    });
  });

  describe('E2-S2-AC3: Collapsed state persists to localStorage and restores on reload', () => {
    it('collapsed state initializes from localStorage on mount', () => {
      // Set collapsed state in localStorage
      localStorage.setItem('activity-rail-collapsed', 'true');
      
      const { container } = render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      // Labels should be hidden because localStorage says it's collapsed
      expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
      expect(screen.queryByText('Observability')).not.toBeInTheDocument();
      
      // Rail should have collapsed class
      const rail = container.querySelector('.activity-rail');
      expect(rail).toHaveClass('collapsed');
    });

    it('toggles persist collapsed state to localStorage', () => {
      render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
      
      // Initially expanded, localStorage should be false or not set
      expect(localStorage.getItem('activity-rail-collapsed')).not.toBe('true');
      
      const toggleBtn = screen.getByRole('button', { name: /collapse navigation rail/i });
      
      // Click to collapse
      fireEvent.click(toggleBtn);
      expect(localStorage.getItem('activity-rail-collapsed')).toBe('true');
      
      // Click to expand
      fireEvent.click(toggleBtn);
      expect(localStorage.getItem('activity-rail-collapsed')).toBe('false');
    });
  });

  describe('E2-S2-AC4: Width transition is animated (not instant snap)', () => {
    it('rail element carries a width CSS transition so the change animates', () => {
      const cssPath = path.join(__dirname, './ActivityRail.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      
      // Verify .activity-rail has a transition property that includes width
      expect(css).toMatch(/\.activity-rail[\s\S]*?\{[\s\S]*?transition:[\s\S]*?width/);
      
      // Verify the rule includes ease-in-out or similar timing function (not just instant)
      expect(css).toMatch(/\.activity-rail[\s\S]*?\{[\s\S]*?transition:[\s\S]*?(ease|linear|cubic-bezier)/);
    });
  });
});

describe('Narrow Viewport Fallback to Icon-Only (E2-S3)', () => {
  describe('E2-S3-AC1: Below 1024px breakpoint, sidebar is icon-only regardless of expanded pref', () => {
    it('ActivityRail.css defines a @media (max-width: 1024px) rule that forces icon-only', () => {
      const cssPath = path.join(__dirname, './ActivityRail.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      
      // Verify @media (max-width: 1024px) rule exists
      expect(css).toMatch(/@media\s*\(\s*max-width\s*:\s*1024px\s*\)/);
      
      // Verify the media query overrides width to the collapsed width (80px)
      expect(css).toMatch(/@media[\s\S]*?\.activity-rail[\s\S]*?\{[\s\S]*?width\s*:\s*80px/);
    });

    it('below 1024px, activity-rail-label is hidden via CSS display:none', () => {
      const cssPath = path.join(__dirname, './ActivityRail.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      
      // Verify the media query hides labels by setting display: none
      expect(css).toMatch(/@media[\s\S]*?\.activity-rail-label[\s\S]*?\{[\s\S]*?display\s*:\s*none/);
    });
  });

  describe('E2-S3-AC2: Above 1024px, stored expanded/collapsed preference is honored (verified on running dashboard)', () => {
    it('media query only applies to max-width 1024px, so above breakpoint normal CSS rules apply', () => {
      const cssPath = path.join(__dirname, './ActivityRail.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      
      // Verify .activity-rail.collapsed rule exists (for manual collapse above breakpoint)
      expect(css).toMatch(/\.activity-rail\.collapsed\s*\{[\s\S]*?width\s*:\s*80px/);
      
      // Verify .activity-rail default width is 240px (expanded state)
      expect(css).toMatch(/^\.activity-rail\s*\{[\s\S]*?width\s*:\s*240px/m);
    });
  });
});

// Rendered-geometry guards.
//
// These exist because a source-text assertion cannot tell a selector that
// MATCHES from one that matches NOTHING. `ActivityRail.css` once sized icons
// via `.activity-rail-icon svg { width: 1.25rem }`, but heroicons apply
// `className` straight to the <svg>, so there was no descendant to match. The
// declaration was present and correct in the file — every source-text test
// passed — while the icons rendered ~215px because a viewBox-only svg with no
// width stretches to fill its flex parent.
//
// `getComputedStyle` resolves the real cascade (vitest runs with `css: true`),
// so a selector that matches nothing reports `auto` and these fail. jsdom does
// no layout, so this checks the applied value, not the final pixel box — that
// is sufficient: the defect was "no width applied at all".
describe('ActivityRail rendered geometry', () => {
  it('sizes the section icons from the stylesheet rather than letting them stretch', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    const icons = document.querySelectorAll('svg.activity-rail-icon');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      const { width, height } = getComputedStyle(icon);
      expect(width).toBe('1.25rem');
      expect(height).toBe('1.25rem');
      expect(width).not.toBe('auto');
    });
  });

  it('sizes the collapse-toggle icon from the stylesheet', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    const toggle = document.querySelector('svg.activity-rail-toggle-icon');
    expect(toggle).toBeTruthy();
    expect(getComputedStyle(toggle).width).toBe('1.25rem');
    expect(getComputedStyle(toggle).height).toBe('1.25rem');
  });

  // Guards the contract the original defect violated: heroicons put `className`
  // on the <svg> itself. If a wrapper is ever introduced, the sizing rules must
  // move with it, and this fails loudly instead of silently unsizing the icon.
  it('applies icon classes to the svg element itself, not a wrapper', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);
    expect(document.querySelector('svg.activity-rail-icon')).toBeTruthy();
    expect(document.querySelector('svg.activity-rail-toggle-icon')).toBeTruthy();
  });
});

// The rail's toggle hides the rail's own icon labels. Naming it "Collapse
// sidebar" made it collide with the session sidebar's collapse control (added
// in E1-S4) on both the accessible name and the persisted key, so the two
// unrelated preferences sat one keystroke apart in the same store.
describe('ActivityRail toggle names and stores itself distinctly', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('names its toggle for the rail, not for the session sidebar', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);

    expect(screen.queryByLabelText(/^\s*(collapse|expand) sidebar\s*$/i)).toBeNull();
    const toggle = screen.getByRole('button', { name: /collapse navigation rail/i });
    expect(toggle).toHaveAttribute('title', 'Collapse navigation rail');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /expand navigation rail/i })).toBeInTheDocument();
  });

  it('persists under its own key and never touches sidebar-collapsed', () => {
    render(<ActivityRail active="sessions" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /collapse navigation rail/i }));

    expect(localStorage.getItem('activity-rail-collapsed')).toBe('true');
    expect(localStorage.getItem('sidebar-collapsed')).toBeNull();
  });
});
