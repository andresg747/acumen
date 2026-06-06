'use client';

import { useEffect, useState } from 'react';
import Onboarding from './components/onboarding';
import OrgOnboarding from './components/org-onboarding';
import WhatsAppGuide from './components/whatsapp-guide';
import Dashboard from './components/dashboard';
import { isProd } from '@/lib/app-env';

type Stage = 'login' | 'org' | 'dashboard' | 'guide';

export default function HomePage() {
  const [stage, setStage] = useState<Stage>('login');
  const [error, setError] = useState('');
  // In prod we must verify the real session before showing anything. In dev
  // auth is bypassed, so there is nothing to check.
  const [checkingSession, setCheckingSession] = useState(isProd);

  useEffect(() => {
    if (!isProd) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = (await res.json()) as { authenticated?: boolean };
        if (active && data.authenticated) {
          setStage('dashboard');
        }
      } catch {
        // Stay on login if the check fails.
      } finally {
        if (active) setCheckingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    if (isProd) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore; we still reset the UI below.
      }
    }
    setStage('login');
  }

  function handleAuthSuccess(mode: 'login' | 'register') {
    // New accounts go through org setup; returning users land on the dashboard.
    setStage(mode === 'register' ? 'org' : 'dashboard');
  }

  if (checkingSession) {
    return (
      <main className="center-screen">
        <p>Cargando…</p>
      </main>
    );
  }

  if (stage === 'login') {
    return (
      <main>
        <Onboarding onError={setError} onSuccess={handleAuthSuccess} error={error} />
      </main>
    );
  }

  if (stage === 'org') {
    return (
      <main>
        <OrgOnboarding onFinish={() => setStage('dashboard')} />
      </main>
    );
  }

  if (stage === 'dashboard') {
    return (
      <main>
        <Dashboard onLogout={handleLogout} onConnectWhatsApp={() => setStage('guide')} />
      </main>
    );
  }

  return (
    <main>
      <WhatsAppGuide onLogout={handleLogout} />
    </main>
  );
}
