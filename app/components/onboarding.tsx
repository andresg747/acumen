'use client';

import { useState } from 'react';
import { isProd } from '@/lib/app-env';

interface OnboardingProps {
  onError: (message: string) => void;
  onSuccess: () => void;
  error?: string;
}

async function getGoogleAuthUrl(): Promise<string> {
  const res = await fetch('/api/auth/google?redirect=0');
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(body?.error ?? 'No pudimos conectar con Google. Intenta de nuevo.');
  }
  return body.url as string;
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function Onboarding({ onError, onSuccess, error }: OnboardingProps) {
  const [loading, setLoading] = useState(false);

  // In dev we bypass auth and simulate success so the UI can be explored
  // without Google credentials. In prod we kick off the real Google OAuth flow.
  async function handleGoogle() {
    setLoading(true);
    onError('');

    if (!isProd) {
      setTimeout(() => {
        onSuccess();
      }, 700);
      return;
    }

    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <WhatsAppGlyph color="#ffffff" />
          </span>
          Acumen
        </div>

        <div>
          <h2 className="aside-headline">
            Acompaña a tu comunidad por WhatsApp, sin complicaciones
          </h2>
          <ul className="aside-points">
            <li>
              <span className="tick" aria-hidden="true">
                <CheckGlyph />
              </span>
              Configúralo en minutos, sin conocimientos técnicos.
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                <CheckGlyph />
              </span>
              Te guiamos paso a paso, en todo momento.
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                <CheckGlyph />
              </span>
              Atiende a las personas de tu organización desde un solo lugar.
            </li>
          </ul>
        </div>

        <p className="aside-foot">
          Organizaciones sociales de toda la región ya acompañan mejor a su comunidad con Acumen.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark" aria-hidden="true">
              <WhatsAppGlyph color="var(--accent-strong)" />
            </span>
            Acumen
          </div>

          <div>
            <h1 className="auth-title">Te damos la bienvenida</h1>
            <p className="auth-sub">
              Inicia sesión con Google para conectar WhatsApp con tu organización.
            </p>
          </div>

          <div className="auth-actions">
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <button
              className="secondary block"
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              {loading ? 'Conectando…' : 'Continuar con Google'}
            </button>
          </div>

          <p className="help-note">
            Usamos Google para validar tu identidad y mantener tu acceso simple.
          </p>
        </div>
      </main>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppGlyph({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.75 4.87-1.28A10 10 0 1 0 12 2Zm5.3 14.06c-.22.63-1.27 1.2-1.78 1.25-.46.05-1.03.07-1.66-.1-.38-.12-.87-.28-1.5-.55-2.64-1.14-4.36-3.8-4.5-3.98-.13-.18-1.07-1.42-1.07-2.71s.68-1.92.92-2.19c.24-.26.52-.33.7-.33.17 0 .35 0 .5.01.16.01.38-.06.59.45.22.52.74 1.8.8 1.93.07.13.11.28.02.46-.09.18-.13.28-.26.44-.13.15-.27.34-.39.46-.13.13-.26.27-.11.53.15.26.66 1.09 1.42 1.76.97.87 1.79 1.13 2.05 1.26.26.13.41.11.56-.07.15-.18.65-.76.82-1.02.17-.26.35-.22.59-.13.24.09 1.52.72 1.78.85.26.13.43.2.5.31.06.11.06.66-.16 1.29Z"
        fill={color}
      />
    </svg>
  );
}
