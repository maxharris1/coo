import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const sql = read("supabase/migrations/0002_cron.sql");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const deploy = read("docs/deploy.md");

const SECRETS = [
  "coo_tick_url",
  "coo_cron_secret",
  "coo_vercel_protection_bypass",
];

const vaultRead = (name: string) =>
  `(select decrypted_secret from vault.decrypted_secrets where name = '${name}')`;

function argument(name: string): string {
  const start = code.indexOf(`${name} :=`);
  expect(start, `net.http_post sets ${name}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start + name.length + 3; i < code.length; i++) {
    const ch = code[i];
    if (ch === "(") depth++;
    if (ch === ")") {
      if (depth === 0) return code.slice(start, i);
      depth--;
    }
    if (ch === "," && depth === 0) return code.slice(start, i);
  }
  throw new Error(`unterminated ${name}`);
}

function squash(s: string) {
  return s.replace(/\s+/g, " ");
}

describe("supabase/migrations/0002_cron.sql", () => {
  it("installs pg_cron and pg_net the way the Supabase docs do", () => {
    expect(squash(code)).toContain(
      "create extension if not exists pg_cron with schema pg_catalog;",
    );
    expect(squash(code)).toContain(
      "create extension if not exists pg_net with schema extensions;",
    );
  });

  it("schedules coo-tick every minute by name, so re-running it replaces the job", () => {
    expect(squash(code)).toMatch(
      /select cron\.schedule\( 'coo-tick', '\* \* \* \* \*',/,
    );
  });

  it("posts to the URL from Vault and nothing else", () => {
    expect(squash(argument("url"))).toBe(`url := ${vaultRead("coo_tick_url")}`);
  });

  it("sends the cron secret and the Vercel bypass from Vault as headers", () => {
    const headers = squash(argument("headers"));

    expect(headers).toContain(
      `'Authorization', 'Bearer ' || ${vaultRead("coo_cron_secret")}`,
    );
    expect(headers).toContain(
      `'x-vercel-protection-bypass', ${vaultRead("coo_vercel_protection_bypass")}`,
    );
  });

  it("keeps the bypass out of the URL, where it would be logged", () => {
    expect(code).not.toMatch(/\?x-vercel-protection-bypass/);
    expect(argument("url")).not.toContain("bypass");
  });

  it("holds no literal URL, host or secret", () => {
    expect(sql).not.toContain("://");
    expect(sql).not.toContain("vercel.app");
    expect(sql).not.toMatch(/Bearer [A-Za-z0-9]/);
  });

  it("reads exactly the three Vault secrets the deploy doc names", () => {
    const named = [...code.matchAll(/where name = '([a-z_]+)'/g)].map(
      (m) => m[1],
    );

    expect(new Set(named)).toEqual(new Set(SECRETS));
    for (const name of SECRETS) expect(deploy).toContain(name);
  });

  it("keeps pruning old events hourly", () => {
    expect(squash(code)).toContain(
      "select cron.schedule('coo-prune-events', '17 * * * *',",
    );
  });
});

describe("docs/deploy.md", () => {
  it("applies the tick health table before the cron job that writes it", () => {
    const health = deploy.indexOf("0004_tick_health.sql");
    const cron = deploy.indexOf("0002_cron.sql");

    expect(health).toBeGreaterThan(-1);
    expect(cron).toBeGreaterThan(health);
  });

  it("shows how to check the job and the health endpoint", () => {
    expect(deploy).toContain("cron.job");
    expect(deploy).toContain("cron.job_run_details");
    expect(deploy).toContain("net._http_response");
    expect(deploy).toContain("/api/health");
  });

  it("rotates each shared secret on both sides and checks the tick still authenticates", () => {
    const rotation = deploy.slice(
      deploy.indexOf("## Change a secret"),
      deploy.indexOf("## Stop the tick"),
    );

    expect(rotation).toContain("coo_cron_secret");
    expect(rotation).toContain("`CRON_SECRET`");
    expect(rotation).toMatch(/[Rr]edeploy/);
    expect(rotation).toContain("coo_vercel_protection_bypass");
    expect(rotation).toContain("Protection Bypass for Automation");
    expect(rotation).toContain("net._http_response");
    expect(rotation).toContain("/api/health");
  });
});
