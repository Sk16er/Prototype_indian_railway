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
import React, { useState, useCallback, Suspense, lazy } from 'react';
import { isLoggedIn, clearTokens } from '../api';
import LandingPage from './LandingPage';

// Code-split: Lazy load App to make login and initial landing instantaneous
const App = lazy(() => import('../App'));

function AppFallback() {
  return (
    <div className="min-h-screen bg-[#001e40] flex flex-col items-center justify-center text-white p-6">
      <div className="w-14 h-14 border-4 border-[#fe9832] border-t-transparent rounded-full animate-spin mb-4" />
      <h2 className="text-xl font-bold tracking-wider uppercase text-[#fe9832]">CRIS-RBMS Sovereign Operations Suite</h2>
      <p className="text-sm text-slate-300 mt-2">Loading authenticated control room dashboard...</p>
      <div className="mt-4 text-xs font-mono text-emerald-400 bg-black/40 px-3 py-1 rounded border border-emerald-500/30">
        ⚡ React.lazy code-splitting active • Instant login enabled
      </div>
    </div>
  );
}

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

      {/* Lazy-loaded App wrapped in Suspense for zero login latency */}
      <Suspense fallback={<AppFallback />}>
        <App />
      </Suspense>
    </div>
  );
}
