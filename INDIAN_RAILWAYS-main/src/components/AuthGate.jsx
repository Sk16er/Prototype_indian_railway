/**
 * AuthGate.jsx — Root-level authentication wrapper
 *
 * Renders LandingPage until the user authenticates via JWT.
 * Once authenticated, renders the original App component unchanged.
 *
 * Also adds a subtle "Sign Out" control to the authenticated session.
 *
 * ZERO modifications to App.jsx or any existing component.
 */
import React, { useState, useCallback } from 'react';
import { isLoggedIn, clearTokens } from '../api';
import LandingPage from './LandingPage';
import App from '../App';

export default function AuthGate() {
  const [authenticated, setAuthenticated] = useState(isLoggedIn());

  const handleAuthenticated = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const handleSignOut = useCallback(() => {
    clearTokens();
    setAuthenticated(false);
  }, []);

  if (!authenticated) {
    return <LandingPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="relative min-h-screen">
      {/* Persistent sign-out control — always accessible, never obscures the dashboard */}
      <div className="fixed top-2 right-4 z-[9999] flex items-center gap-2">
        <button
          onClick={handleSignOut}
          title="Sign Out of RBMS Session"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all hover:scale-105 shadow-lg"
          style={{
            background: 'rgba(0,51,102,0.9)',
            color: '#ffffff',
            border: '1px solid rgba(167,200,255,0.3)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Sign Out
        </button>
      </div>

      {/* Original App — completely untouched */}
      <App />
    </div>
  );
}
