"use client";

import { type FormEvent, useEffect, useState } from "react";
import Onboarding from "./components/onboarding";
import { isProd } from "@/lib/app-env";

type Stage = "login" | "phone" | "success";

const BOT_PHONE_LABEL = "+1 (202) 490-9042";
const BOT_WHATSAPP_URL = `https://wa.me/12024909042?text=${encodeURIComponent('/start')}`;

async function savePhoneNumber(phone: string) {
  const endpoint = "/api/users/phone";
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { endpoint, phone };
}

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("login");
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(isProd);

  useEffect(() => {
    if (!isProd) return;

    let active = true;

    async function checkSession() {
      try {
        const res = await fetch("/api/auth/status");
        const data = (await res.json()) as { authenticated?: boolean };
        if (active && data.authenticated) {
          setStage("phone");
        }
      } catch {
        // Stay on login if session validation fails.
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    if (isProd) {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // The client state is still reset below.
      }
    }

    setError("");
    setStage("login");
  }

  function handleAuthSuccess() {
    setError("");
    setStage("phone");
  }

  if (checkingSession) {
    return (
      <main className="center-screen">
        <p>Cargando...</p>
      </main>
    );
  }

  if (stage === "login") {
    return (
      <main>
        <Onboarding
          onError={setError}
          onSuccess={handleAuthSuccess}
          error={error}
        />
      </main>
    );
  }

  if (stage === "phone") {
    return (
      <main>
        <PhoneSetup
          onComplete={() => setStage("success")}
          onLogout={handleLogout}
        />
      </main>
    );
  }

  return (
    <main>
      <SuccessState onLogout={handleLogout} />
    </main>
  );
}

function PhoneSetup({
  onComplete,
  onLogout,
}: {
  onComplete: () => void;
  onLogout: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = phone.trim();

    if (!value) {
      setError("Ingresá tu número de teléfono.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await savePhoneNumber(value);
      onComplete();
    } catch {
      setError("No pudimos guardar el teléfono. Intentá de nuevo.");
      setSaving(false);
    }
  }

  return (
    <section className="setup-shell" aria-labelledby="phone-title">
      <div className="setup-card">
        <div className="setup-card-head">
          <span className="success-badge" aria-hidden="true">
            <PhoneGlyph />
          </span>
          <h1 id="phone-title">Agregá tu teléfono</h1>
          <p className="muted">
            Usaremos este número para vincular tu cuenta con el bot de WhatsApp.
          </p>
        </div>

        <form className="org-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="phone">Número de teléfono</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+54 9 11 1234 5678"
              autoComplete="tel"
              autoFocus
            />
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="setup-actions">
            <button
              type="button"
              className="secondary"
              onClick={onLogout}
              disabled={saving}
            >
              Cerrar sesión
            </button>
            <button type="submit" className="block" disabled={saving}>
              {saving ? "Guardando…" : "OK"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function SuccessState({ onLogout }: { onLogout: () => void }) {
  return (
    <section className="setup-shell" aria-labelledby="success-title">
      <div className="setup-card setup-success">
        <span className="success-badge" aria-hidden="true">
          <CheckGlyph />
        </span>
        <div className="setup-card-head">
          <h1 id="success-title">Ya podés chatear con el bot</h1>
          <p className="muted">
            Escribile por WhatsApp al {BOT_PHONE_LABEL} para empezar a usar
            Acumen.
          </p>
        </div>

        <a
          className="whatsapp-link"
          href={BOT_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
        >
          Abrir chat de WhatsApp
        </a>

        <button type="button" className="secondary" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}

function PhoneGlyph() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10 17h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
