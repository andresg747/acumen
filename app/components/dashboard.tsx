'use client';

import { useState } from 'react';
import { isProd } from '@/lib/app-env';

interface DashboardProps {
  onLogout: () => void;
  onConnectWhatsApp: () => void;
}

interface Kpi {
  label: string;
  value: string;
  delta?: string;
}

interface Program {
  name: string;
  goalLabel: string;
  current: number;
  target: number;
}

interface Beneficiary {
  name: string;
  initials: string;
  program: string;
  lastUpdate: string;
}

interface Evidence {
  quote: string;
  author: string;
  program: string;
}

const KPIS: Kpi[] = [
  { label: 'Personas acompañadas', value: '342', delta: '+28 este año' },
  { label: 'Programas activos', value: '5', delta: '2 nuevos' },
  { label: 'Sesiones registradas', value: '1.870', delta: '+312 este trimestre' },
  { label: 'Tasa de continuidad', value: '86%', delta: '+4 pts' },
];

const PROGRAMS: Program[] = [
  { name: 'Apoyo escolar', goalLabel: '120 niñas y niños', current: 98, target: 120 },
  { name: 'Salud comunitaria', goalLabel: '200 atenciones', current: 176, target: 200 },
  { name: 'Capacitación laboral', goalLabel: '60 egresadas', current: 41, target: 60 },
  { name: 'Seguridad alimentaria', goalLabel: '150 familias', current: 150, target: 150 },
];

const BENEFICIARIES: Beneficiary[] = [
  { name: 'M. G.', initials: 'MG', program: 'Apoyo escolar', lastUpdate: 'Hace 2 días' },
  { name: 'J. P.', initials: 'JP', program: 'Salud comunitaria', lastUpdate: 'Hace 5 días' },
  { name: 'A. R.', initials: 'AR', program: 'Capacitación laboral', lastUpdate: 'Hace 1 semana' },
  { name: 'L. S.', initials: 'LS', program: 'Seguridad alimentaria', lastUpdate: 'Hace 1 semana' },
];

const EVIDENCE: Evidence[] = [
  {
    quote:
      'Desde que mi hija asiste al apoyo escolar, mejoró sus notas y volvió a entusiasmarse con la escuela.',
    author: 'Madre, programa de Apoyo escolar',
    program: 'Apoyo escolar',
  },
  {
    quote:
      'Aprendí un oficio y hoy tengo mi propio emprendimiento de costura. Cambió la vida de mi familia.',
    author: 'Egresada, Capacitación laboral',
    program: 'Capacitación laboral',
  },
];

export default function Dashboard({ onLogout, onConnectWhatsApp }: DashboardProps) {
  // Demo toggle for dev only. In prod there is no mock data, so the dashboard
  // shows the real (currently empty) state until a backend provides data.
  const [hasData, setHasData] = useState(false);
  const showData = !isProd && hasData;

  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <ImpactGlyph />
          </span>
          Acumen
        </div>

        <div className="dash-topbar-right">
          {!isProd && (
            <button
              type="button"
              className="demo-toggle"
              onClick={() => setHasData((v) => !v)}
              title="Demostración: alterna entre el estado vacío y con datos"
            >
              {hasData ? 'Ver estado vacío' : 'Ver con datos'}
            </button>
          )}
          <div className="dash-user" aria-hidden="true">
            <span className="avatar">AC</span>
          </div>
          <button type="button" className="secondary" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="dash-body">
        {showData ? (
          <PopulatedState onConnectWhatsApp={onConnectWhatsApp} />
        ) : (
          <EmptyState onConnectWhatsApp={onConnectWhatsApp} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onConnectWhatsApp }: { onConnectWhatsApp: () => void }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty-head">
        <span className="dash-empty-icon" aria-hidden="true">
          <ImpactGlyph color="var(--accent-strong)" size={26} />
        </span>
        <h1>Empieza a registrar el impacto de tu organización</h1>
        <p>
          Acumen te ayuda a llevar el historial de las personas que acompañas, medir el avance de tus
          programas y construir reportes con evidencia. Da el primer paso.
        </p>
      </div>

      <ul className="action-grid">
        <li className="action-card">
          <span className="action-icon" aria-hidden="true">
            <PersonCardGlyph />
          </span>
          <div className="action-text">
            <h3>Registra a un beneficiario</h3>
            <p>Crea la ficha de una persona o paciente para llevar su historial de acompañamiento.</p>
          </div>
          <button type="button" className="block" disabled>
            Crear ficha (próximamente)
          </button>
        </li>

        <li className="action-card">
          <span className="action-icon" aria-hidden="true">
            <TargetGlyph />
          </span>
          <div className="action-text">
            <h3>Crea un programa</h3>
            <p>Define una meta y empieza a medir su avance para generar KPIs automáticamente.</p>
          </div>
          <button type="button" className="secondary block" disabled>
            Nuevo programa (próximamente)
          </button>
        </li>

        <li className="action-card">
          <span className="action-icon" aria-hidden="true">
            <FolderGlyph />
          </span>
          <div className="action-text">
            <h3>Importa tu información</h3>
            <p>Conecta una carpeta de Google Drive para traer los datos que ya tienes.</p>
          </div>
          <button type="button" className="secondary block" disabled>
            Importar (próximamente)
          </button>
        </li>
      </ul>

      <div className="dash-hint">
        <span className="action-icon small" aria-hidden="true">
          <WhatsAppGlyph color="var(--accent-strong)" />
        </span>
        <div className="action-text">
          <h3>¿Prefieres registrar desde WhatsApp?</h3>
          <p>Conecta tu número y registra avances conversando, sin planillas.</p>
        </div>
        <button type="button" className="secondary" onClick={onConnectWhatsApp}>
          Conectar WhatsApp
        </button>
      </div>
    </div>
  );
}

function PopulatedState({ onConnectWhatsApp }: { onConnectWhatsApp: () => void }) {
  return (
    <div className="dash-data">
      <div className="dash-data-head">
        <div>
          <h1>Hola, Fundación Manos Unidas</h1>
          <p className="muted">Resumen de impacto · Año 2026</p>
        </div>
        <div className="dash-head-actions">
          <button type="button" className="secondary" onClick={onConnectWhatsApp}>
            Guía de WhatsApp
          </button>
          <button type="button">Generar reporte anual</button>
        </div>
      </div>

      {/* Aggregate, shareable metrics */}
      <section className="dash-block">
        <div className="dash-section-head">
          <div className="head-with-tag">
            <h2>Indicadores clave (KPIs)</h2>
            <span className="data-tag shareable">
              <GlobeGlyph />
              Compartible
            </span>
          </div>
          <span className="muted">Métricas agregadas, seguras para reportes públicos</span>
        </div>
        <ul className="stat-grid">
          {KPIS.map((s) => (
            <li key={s.label} className="stat-card">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
              {s.delta && <span className="stat-delta">{s.delta}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* Program progress */}
      <section className="dash-block">
        <div className="dash-section-head">
          <div className="head-with-tag">
            <h2>Avance de programas</h2>
            <span className="data-tag shareable">
              <GlobeGlyph />
              Compartible
            </span>
          </div>
          <span className="muted">Progreso hacia las metas anuales</span>
        </div>
        <ul className="program-list">
          {PROGRAMS.map((p) => {
            const pct = Math.round((p.current / p.target) * 100);
            const done = pct >= 100;
            return (
              <li key={p.name} className="program">
                <div className="program-top">
                  <span className="program-name">{p.name}</span>
                  <span className="program-count">
                    {p.current} / {p.target}
                    <span className="muted"> · {p.goalLabel}</span>
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Avance de ${p.name}`}
                >
                  <span
                    className={`progress-bar${done ? ' complete' : ''}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="program-pct">{done ? 'Meta alcanzada' : `${pct}% completado`}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="dash-two-col">
        {/* Sensitive individual records */}
        <section className="dash-block">
          <div className="dash-section-head">
            <div className="head-with-tag">
              <h2>Historial de beneficiarios</h2>
              <span className="data-tag private">
                <LockGlyph />
                Privado
              </span>
            </div>
            <span className="muted">Datos individuales sensibles · acceso restringido</span>
          </div>
          <ul className="bene-list">
            {BENEFICIARIES.map((b) => (
              <li key={b.name} className="bene">
                <span className="conv-avatar" aria-hidden="true">
                  {b.initials}
                </span>
                <div className="conv-info">
                  <div className="conv-top">
                    <span className="conv-name">{b.name}</span>
                    <span className="conv-time">{b.lastUpdate}</span>
                  </div>
                  <span className="conv-preview">{b.program}</span>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary block" disabled>
            Ver todas las fichas (próximamente)
          </button>
        </section>

        {/* Qualitative evidence */}
        <section className="dash-block">
          <div className="dash-section-head">
            <div className="head-with-tag">
              <h2>Evidencia cualitativa</h2>
              <span className="data-tag shareable">
                <GlobeGlyph />
                Compartible
              </span>
            </div>
            <span className="muted">Testimonios anonimizados para tus reportes</span>
          </div>
          <ul className="evidence-list">
            {EVIDENCE.map((e) => (
              <li key={e.author} className="evidence">
                <QuoteGlyph />
                <blockquote>{e.quote}</blockquote>
                <cite>{e.author}</cite>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Continuity */}
      <section className="continuity">
        <span className="action-icon small" aria-hidden="true">
          <ShieldGlyph />
        </span>
        <div className="action-text">
          <h3>Continuidad asegurada</h3>
          <p>
            Toda la información queda registrada en Acumen, no en una persona. Si cambia el equipo, el
            historial y los reportes siguen disponibles para quien continúe.
          </p>
        </div>
        <button type="button" className="secondary" disabled>
          Gestionar accesos
        </button>
      </section>
    </div>
  );
}

function ImpactGlyph({ color = 'var(--accent-strong)', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonCardGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 7c0-2.2 2.7-3.5 5-3.5s5 1.3 5 3.5M15 9h5M15 13h5"
        stroke="var(--accent-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TargetGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--accent-strong)" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="var(--accent-strong)" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.4" fill="var(--accent-strong)" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"
        fill="var(--accent-strong)"
      />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function QuoteGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 7H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2H4M21 7h-5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2h-1"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 22.3 5 18.4 5 14V6l7-3Z"
        stroke="var(--accent-strong)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="var(--accent-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
