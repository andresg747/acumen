'use client';

import { useState } from 'react';

interface OrgOnboardingProps {
  onFinish: () => void;
}

type Phase = 'details' | 'drive' | 'success';

const MOCK_FOLDERS = [
  { id: 'f1', name: 'Beneficiarios 2025', items: '128 archivos' },
  { id: 'f2', name: 'Voluntarios', items: '34 archivos' },
  { id: 'f3', name: 'Donaciones', items: '212 archivos' },
  { id: 'f4', name: 'Documentos generales', items: '57 archivos' },
];

const INVITE_LINK = 'https://acumen.app/unirse/org-9f3a2c';

export default function OrgOnboarding({ onFinish }: OrgOnboardingProps) {
  const [phase, setPhase] = useState<Phase>('details');
  const [orgName, setOrgName] = useState('');
  const [integrate, setIntegrate] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stepNumber = phase === 'details' ? 2 : 3;

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    if (integrate) {
      setPhase('drive');
    } else {
      setPhase('success');
    }
  }

  function handleConnectFolder() {
    // UI only: pretend the folder was connected.
    setPhase('success');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(INVITE_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="org-shell">
      <header className="org-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <WhatsAppGlyph color="var(--accent-strong)" />
          </span>
          Acumen
        </div>
      </header>

      <div className="org-body">
        <Stepper current={stepNumber} />

        {phase === 'details' && (
          <section className="org-card" aria-labelledby="org-details-title">
            <div className="org-card-head">
              <h1 id="org-details-title">Crea tu organización</h1>
              <p className="muted">
                Cuéntanos el nombre con el que se conoce a tu organización. Así las personas sabrán
                quién las acompaña.
              </p>
            </div>

            <form className="org-form" onSubmit={handleDetailsSubmit}>
              <div className="field">
                <label htmlFor="orgName">Nombre de la organización</label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ej. Fundación Manos Unidas"
                  autoFocus
                />
              </div>

              <label className="check-card" data-checked={integrate}>
                <input
                  type="checkbox"
                  checked={integrate}
                  onChange={(e) => setIntegrate(e.target.checked)}
                />
                <span className="check-box" aria-hidden="true">
                  {integrate && <CheckGlyph />}
                </span>
                <span className="check-text">
                  <strong>Quiero usar información que ya tengo</strong>
                  <span className="muted">
                    Conecta una carpeta de Google Drive para que Acumen use tus datos existentes
                    (beneficiarios, contactos, etc.).
                  </span>
                </span>
              </label>

              <button type="submit" className="block" disabled={!orgName.trim()}>
                Continuar
              </button>
            </form>
          </section>
        )}

        {phase === 'drive' && (
          <section className="org-card" aria-labelledby="org-drive-title">
            <div className="org-card-head">
              <h1 id="org-drive-title">Elige una carpeta de Google Drive</h1>
              <p className="muted">
                Selecciona la carpeta con la información que quieres usar. Solo tendremos acceso a la
                carpeta que elijas.
              </p>
            </div>

            <ul className="folder-list">
              {MOCK_FOLDERS.map((folder) => {
                const active = selectedFolder === folder.id;
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className="folder"
                      data-active={active}
                      onClick={() => setSelectedFolder(folder.id)}
                    >
                      <span className="folder-icon" aria-hidden="true">
                        <FolderGlyph />
                      </span>
                      <span className="folder-info">
                        <strong>{folder.name}</strong>
                        <span className="muted">{folder.items}</span>
                      </span>
                      <span className="folder-radio" data-active={active} aria-hidden="true">
                        {active && <CheckGlyph />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="org-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setPhase('details')}
              >
                Atrás
              </button>
              <button
                type="button"
                className="block"
                onClick={handleConnectFolder}
                disabled={!selectedFolder}
              >
                Conectar carpeta
              </button>
            </div>
          </section>
        )}

        {phase === 'success' && (
          <section className="org-card org-success" aria-labelledby="org-success-title">
            <span className="success-badge" aria-hidden="true">
              <CheckGlyph large />
            </span>
            <div className="org-card-head">
              <h1 id="org-success-title">
                {orgName ? `¡${orgName} está lista!` : '¡Tu organización está lista!'}
              </h1>
              <p className="muted">
                {integrate
                  ? 'Conectamos tu carpeta de Google Drive. Ahora invita a tu equipo para empezar a trabajar juntos.'
                  : 'Tu organización ya quedó creada. Invita a tu equipo para empezar a trabajar juntos.'}
              </p>
            </div>

            <div className="invite-box">
              <span className="invite-label">Enlace de invitación</span>
              <div className="invite-row">
                <span className="invite-link" title={INVITE_LINK}>
                  {INVITE_LINK}
                </span>
                <button type="button" className="secondary" onClick={handleCopy}>
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="muted invite-help">
                Comparte este enlace con las personas de tu organización para que se registren y
                formen parte de tu equipo.
              </p>
            </div>

            <button type="button" className="block" onClick={onFinish}>
              Continuar a la configuración de WhatsApp
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Inicia sesión' },
    { n: 2, label: 'Tu organización' },
    { n: 3, label: 'Listo' },
  ];
  return (
    <ol className="stepper" aria-label="Progreso de configuración">
      {steps.map((step, i) => {
        const state =
          step.n < current ? 'done' : step.n === current ? 'current' : 'todo';
        return (
          <li key={step.n} className="stepper-item" data-state={state}>
            <span className="stepper-dot" aria-hidden="true">
              {state === 'done' ? <CheckGlyph /> : step.n}
            </span>
            <span className="stepper-label">{step.label}</span>
            {i < steps.length - 1 && <span className="stepper-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function CheckGlyph({ large }: { large?: boolean }) {
  const size = large ? 28 : 14;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
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
