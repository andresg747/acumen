'use client';

import { useState } from 'react';
import Onboarding from './components/onboarding';
import OrgOnboarding from './components/org-onboarding';
import WhatsAppGuide from './components/whatsapp-guide';

type Stage = 'login' | 'org' | 'guide';

export default function HomePage() {
  const [stage, setStage] = useState<Stage>('login');
  const [error, setError] = useState('');

  function handleLogout() {
    setStage('login');
  }

  if (stage === 'login') {
    return (
      <main>
        <Onboarding
          onError={setError}
          onSuccess={() => setStage('org')}
          error={error}
        />
      </main>
    );
  }

  if (stage === 'org') {
    return (
      <main>
        <OrgOnboarding onFinish={() => setStage('guide')} />
      </main>
    );
  }

  return (
    <main>
      <WhatsAppGuide onLogout={handleLogout} />
    </main>
  );
}
