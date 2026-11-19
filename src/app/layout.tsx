import type { Metadata } from "next";
import type { ReactNode } from "react";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={config.app.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
