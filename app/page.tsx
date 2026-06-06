"use client";

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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface DriveFile {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}

interface ListResponse {
  files: DriveFile[];
  nextPageToken: string | null;
}

interface AcumenStatus {
  authenticated: boolean;
  folderReady: boolean;
  folderId?: string;
}

async function jsonFetch<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

function formatBytes(raw: string | null | undefined): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function HomePage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [acumenStatus, setAcumenStatus] = useState<AcumenStatus | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [query, setQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await jsonFetch<AcumenStatus>("/api/acumen/status");
      setAcumenStatus(data);
      setAuthenticated(data.authenticated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "25" });
      if (query.trim()) params.set("query", query.trim());
      const data = await jsonFetch<ListResponse>(`/api/drive/files?${params}`);
      setFiles(data.files ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  }, [query]);

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
  useEffect(() => {
    if (authenticated) {
      void loadFiles();
      void jsonFetch<{ name: string | null; email: string | null }>(
        "/api/auth/me",
      )
        .then((data) => setUserName(data.name ?? data.email))
        .catch(() => setUserName(null));
    } else {
      setUserName(null);
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
  async function handleSignIn() {
    try {
      const data = await jsonFetch<{ url: string }>(
        "/api/auth/google?redirect=0",
      );
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleLogout() {
    try {
      await jsonFetch("/api/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setAcumenStatus({ authenticated: false, folderReady: false });
      setFiles([]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRename(file: DriveFile) {
    if (!file.id) return;
    const next = window.prompt("Nuevo nombre", file.name ?? "");
    if (!next || next === file.name) return;
    setRenaming(file.id);
    setError(null);
    try {
      await jsonFetch(
        `/api/drive/files/${encodeURIComponent(file.id)}/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next }),
        },
      );
      await loadFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenaming(null);
    }
  }

  if (stage === 'dashboard') {
    return (
      <main>
        <Dashboard onLogout={handleLogout} onConnectWhatsApp={() => setStage('guide')} />
      <main className="container">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  return (
    <main>
      <WhatsAppGuide onLogout={handleLogout} />
    <main className="container">
      <header style={{ textAlign: "center", position: "relative" }}>
        {authenticated && userName && <h1>{userName}</h1>}
        {authenticated ? (
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: "transparent",
              border: "none",
              padding: 8,
              cursor: "pointer",
              color: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        ) : (
          <div className="row" style={{ justifyContent: "center" }}>
            <button onClick={handleSignIn}>Iniciar sesión con Google</button>
          </div>
        )}
      </header>

      {error && (
        <div className="section card error" role="alert">
          {error}
        </div>
      )}

      {!authenticated ? (
        <section className="section card">
          <h2>Sesión no iniciada</h2>
          <p className="muted">
            Haz clic en <strong>Iniciar sesión con Google</strong> para
            otorgar acceso. En el primer inicio de sesión, halketon crea una
            carpeta <strong>ACUMEN</strong> en la raíz si es necesario y solo
            usa los archivos dentro de esa carpeta.
          </p>
        </section>
      ) : (
        <>
          {/*<section className="section card">
            <h2>ACUMEN folder</h2>
            <p className="muted">
              This app only uses files in your root <strong>ACUMEN</strong> Google Drive folder.
              Uploads go there automatically, and the file list below is scoped to that folder.
            </p>
            <div className={acumenStatus?.folderReady ? 'success' : 'muted'}>
              {acumenStatus?.folderReady
                ? `Ready${acumenStatus.folderId ? ` · ${acumenStatus.folderId}` : ''}`
                : 'Preparing ACUMEN folder… refresh if this does not update shortly.'}
            </div>
          </section>*/}

          <section className="section row" style={{ justifyContent: "center" }}>
            <Link href="/upload">
              <button>Subir</button>
            </Link>
          </section>

          <section className="section card">
            <h2>Archivos</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadFiles();
              }}
              style={{ position: "relative" }}
            >
              <input
                type="text"
                placeholder="Búsqueda en Drive (opcional)"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                style={{ width: "100%", paddingRight: 40, minWidth: 240 }}
              />
              <button
                type="submit"
                disabled={loadingFiles}
                aria-label="Buscar"
                title="Buscar"
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 4,
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  padding: 6,
                  cursor: loadingFiles ? "default" : "pointer",
                  color: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </form>

            <div className="file-list">
              {files.length === 0 && !loadingFiles && (
                <div className="muted">Aún no hay archivos.</div>
              )}
              {files.map((file) => (
                <div key={file.id ?? Math.random()} className="file-row">
                  <div>
                    <div>
                      <strong>{file.name ?? "(sin nombre)"}</strong>
                    </div>
                    <div className="file-meta">
                      {file.mimeType ?? ""}
                      {file.size ? ` · ${formatBytes(file.size)}` : ""}
                      {file.modifiedTime
                        ? ` · modificado ${file.modifiedTime}`
                        : ""}
                    </div>
                  </div>
                  <div className="row">
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    )}
                    {file.id && (
                      <a
                        href={`/api/drive/files/${encodeURIComponent(file.id)}/content`}
                      >
                        Descargar
                      </a>
                    )}
                    <button
                      className="secondary"
                      onClick={() => handleRename(file)}
                      disabled={renaming === file.id}
                    >
                      {renaming === file.id ? "Renombrando…" : "Renombrar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
