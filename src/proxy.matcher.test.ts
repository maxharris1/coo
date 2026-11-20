// Its own file: importing the Next testing util patches console so that a log outside a Next request throws, which breaks proxy.test.ts.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("proxy matcher", () => {
  const matches = (url: string) =>
    unstable_doesMiddlewareMatch({ config, url });

  it.each([
    "/",
    "/flights",
    "/welcome",
    "/welcome/bird",
    "/join/k3x9",
    "/b/amber-gull-42",
    "/api",
    "/api/sync",
  ])("runs on %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image?url=%2Fassets%2Fbird.png&w=64&q=75",
    "/favicon.ico",
    "/assets/birds/amber.svg",
    "/assets/data/birds.json",
    "/map/style",
    "/map/tiles/3/2/1.png",
    "/manifest.webmanifest",
    "/fonts/inter.woff2",
    "/icon.png",
    "/apple-touch-icon.jpg",
  ])("skips %s", (url) => {
    expect(matches(url)).toBe(false);
  });
});
