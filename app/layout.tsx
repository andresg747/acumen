import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acumen — Conecta tu WhatsApp',
  description:
    'Empieza a usar WhatsApp con tu negocio en unos minutos. Inicia sesión y sigue los pasos guiados.',
  title: 'halketon',
  description: 'Google Drive OAuth + operaciones de archivos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="bg-background">
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
