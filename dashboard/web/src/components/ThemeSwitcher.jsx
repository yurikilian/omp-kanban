import React from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../context/ThemeContext';
import './ThemeSwitcher.css';

export default function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="theme-switcher"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="theme-icon">
        {theme === 'light' ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
      </span>
    </button>
  );
}
