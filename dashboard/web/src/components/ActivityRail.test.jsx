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
  it('primary blue (#0d6efd) meets WCAG AA contrast against light background', () => {
    // E1-S1-AC3: Verify that --primary blue (#0d6efd) has >= 4.5:1 contrast with light background
    // #0d6efd RGB: 13, 110, 253 (light blue)
    // Light background: white (#ffffff) RGB: 255, 255, 255
    // Text color: white (#ffffff) RGB: 255, 255, 255
    
    const primaryRgb = { r: 13, g: 110, b: 253 };
    const lightBgRgb = { r: 255, g: 255, b: 255 };
    const whiteTextRgb = { r: 255, g: 255, b: 255 };
    
    const getLuminance = ({ r, g, b }) => {
      const [rs, gs, bs] = [r, g, b].map(x => {
        const c = x / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    // Calculate contrast ratio for primary blue background with white text
    const l1 = getLuminance(primaryRgb);
    const l2 = getLuminance(whiteTextRgb);
    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    
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
