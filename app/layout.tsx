import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acumen — Conecta tu WhatsApp',
  description:
    'Empieza a usar WhatsApp con tu negocio en unos minutos. Inicia sesión y sigue los pasos guiados.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="bg-background">
      <body>{children}</body>
    </html>
  );
}
