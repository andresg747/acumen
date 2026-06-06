'use client';

import { useMemo, useState } from 'react';

interface WhatsAppGuideProps {
  onLogout: () => void;
}

interface Step {
  title: string;
  description: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    title: 'Ten a mano tu teléfono con WhatsApp',
    description:
      'Asegúrate de tener instalado WhatsApp en el teléfono donde recibes los mensajes de tu organización. Si usas WhatsApp Business, ¡mejor aún!',
    tip: 'Si todavía no tienes WhatsApp Business, puedes descargarlo gratis desde la tienda de aplicaciones.',
  },
  {
    title: 'Abre la opción "Dispositivos vinculados"',
    description:
      'En WhatsApp, toca el menú (los tres puntos o Ajustes) y entra en "Dispositivos vinculados". Desde ahí podrás conectar Acumen de forma segura.',
  },
  {
    title: 'Escanea el código que te mostramos',
    description:
      'Toca "Vincular un dispositivo" y apunta la cámara de tu teléfono al código QR que aparecerá en esta pantalla. La conexión se hace sola.',
    tip: 'El código es único y privado. Nunca lo compartas con nadie más.',
  },
  {
    title: 'Confirma el nombre de tu organización',
    description:
      'Escribe el nombre con el que conocen a tu organización. Así las personas sabrán que están hablando contigo cuando les respondas.',
  },
  {
    title: '¡Envía tu primer mensaje de prueba!',
    description:
      'Te enviaremos un mensaje de bienvenida a tu propio WhatsApp para que veas que todo funciona. Si lo recibes, ¡ya está todo listo!',
    tip: 'A partir de aquí, todos los mensajes de las personas que acompañas llegarán a Acumen automáticamente.',
  },
];

export default function WhatsAppGuide({ onLogout }: WhatsAppGuideProps) {
  const [completed, setCompleted] = useState<boolean[]>(() => STEPS.map(() => false));

  const doneCount = useMemo(() => completed.filter(Boolean).length, [completed]);
  const percent = Math.round((doneCount / STEPS.length) * 100);
  const allDone = doneCount === STEPS.length;

  function toggle(index: number) {
    setCompleted((prev) => prev.map((value, i) => (i === index ? !value : value)));
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <WhatsAppGlyph color="var(--accent-strong)" />
          </span>
          Acumen
        </div>
        <button className="secondary" onClick={onLogout}>
          Cerrar sesión
        </button>
      </header>

      <section className="hero">
        <h1>Conecta WhatsApp con tu organización</h1>
        <p>
          Sigue estos pasos sencillos para empezar a acompañar a tu comunidad por WhatsApp. Marca
          cada paso cuando lo termines; nosotros te acompañamos en todo momento.
        </p>

        <div className="progress" aria-live="polite">
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="progress-label">
            {allDone
              ? '¡Felicitaciones! Has completado todos los pasos.'
              : `Has completado ${doneCount} de ${STEPS.length} pasos.`}
          </div>
        </div>
      </section>

      <div className="steps">
        {STEPS.map((step, index) => {
          const isDone = completed[index];
          return (
            <button
              key={step.title}
              type="button"
              className={isDone ? 'step done' : 'step'}
              onClick={() => toggle(index)}
              aria-pressed={isDone}
            >
              <span className="step-index" aria-hidden="true">
                {isDone ? <CheckGlyph /> : index + 1}
              </span>
              <span className="step-body">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {step.tip && <span className="step-tip">Consejo: {step.tip}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <footer className="guide-footer">
        {allDone ? (
          <p className="muted">
            Todo listo. Tu WhatsApp ya está conectado y puedes empezar a acompañar a tu comunidad.
          </p>
        ) : (
          <p className="muted">
            ¿Tienes dudas? Escríbenos y te ayudamos a terminar la configuración.
          </p>
        )}
      </footer>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
