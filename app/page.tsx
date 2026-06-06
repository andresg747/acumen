'use client';

import { useCallback, useEffect, useState } from 'react';
import Onboarding from './components/onboarding';
import WhatsAppGuide from './components/whatsapp-guide';

export default function HomePage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as { authenticated: boolean };
      setAuthenticated(Boolean(data.authenticated));
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthenticated(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="center-screen">
        <p>Cargando…</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main>
        <Onboarding onError={setError} error={error} />
      </main>
    );
  }

  return (
    <main>
      <WhatsAppGuide onLogout={handleLogout} />
    </main>
  );
}
