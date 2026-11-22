import type { NextConfig } from "next";

const GUEST_SOURCES = ["/b/:path*", "/api/guest/:path*"];

const GUEST_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex" },
];

const nextConfig: NextConfig = {
  async headers() {
    return GUEST_SOURCES.map((source) => ({ source, headers: GUEST_HEADERS }));
  },
};

export default nextConfig;
