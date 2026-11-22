import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { config } from "@/lib/config";
import { OfflineBanner } from "./OfflineBanner";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import "../../public/assets/tokens.css";
import "../../public/assets/motion.css";
import "../components/flight.css";
import "./globals.css";
import { InstallReporter } from "./InstallReporter";
import { ThemeColor } from "./ThemeColor";

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.tagline,
  appleWebApp: {
    capable: true,
    title: config.app.shortName,
    statusBarStyle: "default",
  },
  icons: { apple: "/assets/app-icon/apple-touch-icon-180.png" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: config.app.themeColor,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={config.app.defaultLocale}>
      <body>
        <OfflineBanner />
        {children}
        <RegisterServiceWorker />
        <InstallReporter />
        <ThemeColor />
      </body>
    </html>
  );
}
