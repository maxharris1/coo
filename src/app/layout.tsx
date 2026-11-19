import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { config } from "@/lib/config";
import "../../public/assets/tokens.css";
import "../../public/assets/motion.css";
import "./globals.css";

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={config.app.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
