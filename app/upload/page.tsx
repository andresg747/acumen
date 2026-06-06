'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AcumenStatus {
  authenticated: boolean;
  folderReady: boolean;
  folderId?: string;
}

interface UploadResult {
  id?: string | null;
  name?: string | null;
  webViewLink?: string | null;
}

const ACCEPTED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];

const ACCEPT_ATTR =
  'image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv';

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME.includes(file.type)) return true;
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith('.csv') || lower.endsWith('.xls') || lower.endsWith('.xlsx');
}

export default function UploadPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [folderReady, setFolderReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/acumen/status');
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const data = (await res.json()) as AcumenStatus;
      setAuthenticated(data.authenticated);
      setFolderReady(data.folderReady);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  async function handleSignIn() {
    try {
      const res = await fetch('/api/auth/google?redirect=0');
      if (!res.ok) throw new Error(`Auth init failed (${res.status})`);
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;

      const accepted = arr.filter(isAcceptedFile);
      const rejected = arr.length - accepted.length;
      if (rejected > 0) {
        setError(
          `${rejected} archivo${rejected === 1 ? '' : 's'} omitido${rejected === 1 ? '' : 's'} — solo se permiten imágenes, PDF y Excel/CSV.`,
        );
      } else {
        setError(null);
      }
      if (accepted.length === 0) return;

      setUploading(true);
      try {
        const results: UploadResult[] = [];
        for (const file of accepted) {
          const form = new FormData();
          form.append('file', file);
          form.append('name', file.name);
          const res = await fetch('/api/drive/files', { method: 'POST', body: form });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Error al subir ${file.name} (${res.status})`);
          }
          const data = (await res.json()) as UploadResult;
          results.push(data);
        }
        setUploaded((prev) => [...results, ...prev]);
        router.push('/');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [router],
  );

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading || !authenticated) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!authenticated || uploading) return;
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function onPickFiles() {
    if (uploading) return;
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      void uploadFiles(files);
    }
    e.currentTarget.value = '';
  }

  if (!authChecked) {
    return (
      <main className="upload-screen">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="upload-screen">
        <div className="upload-center">
          <h1 className="upload-title">Subir a Drive</h1>
          <p className="muted upload-subtitle">
            Inicia sesión con Google para subir archivos a tu carpeta ACUMEN.
          </p>
          <button className="upload-cta" onClick={handleSignIn}>
            Iniciar sesión con Google
          </button>
          {error && <div className="error upload-error">{error}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="upload-screen">
      <div className="upload-center">
        <h1 className="upload-title">Subir a Drive</h1>
        <p className="muted upload-subtitle">
          {folderReady
            ? 'Arrastra tus archivos aquí — imágenes, PDF, Excel/CSV.'
            : 'Preparando la carpeta ACUMEN…'}
        </p>

        <div
          className={`dropzone${dragOver ? ' dropzone--active' : ''}${uploading ? ' dropzone--busy' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onPickFiles}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPickFiles();
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={onInputChange}
            style={{ display: 'none' }}
          />
          <div className="dropzone__icon" aria-hidden>
            ⇪
          </div>
          <div className="dropzone__primary">
            {uploading ? 'Subiendo…' : 'Arrastra archivos aquí o haz clic para buscar'}
          </div>
          <div className="dropzone__hint muted">
            Imágenes · PDF · Excel (.xls, .xlsx) · CSV
          </div>
        </div>

        {error && <div className="error upload-error">{error}</div>}

        {uploaded.length > 0 && (
          <div className="upload-results">
            <h2>Subidos</h2>
            <ul>
              {uploaded.map((f, i) => (
                <li key={f.id ?? i}>
                  {f.webViewLink ? (
                    <a href={f.webViewLink} target="_blank" rel="noreferrer">
                      {f.name ?? '(sin nombre)'}
                    </a>
                  ) : (
                    <span>{f.name ?? '(sin nombre)'}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/" style={{ width: '100%', marginTop: 24 }}>
          <button style={{ width: '100%' }}>Volver</button>
        </Link>
      </div>
    </main>
  );
}
