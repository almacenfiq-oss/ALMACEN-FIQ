import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Almacén FIQ", template: "%s · Almacén FIQ" },
  description: "Inventario de reactivos, material de vidrio y equipos del almacén de laboratorio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17232b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
