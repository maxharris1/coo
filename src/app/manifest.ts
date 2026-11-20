import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: config.app.name,
    short_name: config.app.shortName,
    description: config.app.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: config.app.themeColor,
    background_color: config.app.backgroundColor,
    icons: [
      {
        src: "/assets/app-icon/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/assets/app-icon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/assets/app-icon/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
