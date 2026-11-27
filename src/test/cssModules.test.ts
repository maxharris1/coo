import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it, vi } from "vitest";
import { classNames, modulePath } from "./cssModules";

const SHEET = "src/components/Tracker.module.css";
const checkout = mkdtempSync(join(tmpdir(), "coo checkout "));
const root = pathToFileURL(`${checkout}/`);

afterAll(() => rmSync(checkout, { recursive: true, force: true }));

it("mocks a CSS module in a checkout path with a space", async () => {
  cpSync(SHEET, join(checkout, SHEET), { recursive: true });
  vi.doMock(modulePath(SHEET, root), () => ({ default: classNames(SHEET) }));

  const { default: styles } = await import(
    /* @vite-ignore */ join(checkout, SHEET)
  );

  expect(root.href).toContain("%20");
  expect(styles.map).toBe("Tracker__map");
});
