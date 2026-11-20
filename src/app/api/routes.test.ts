import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API = join(process.cwd(), "src/app/api");
const routes = readdirSync(API, { recursive: true, encoding: "utf8" })
  .filter((file) => /(^|\/)route\.ts$/.test(file))
  .map((file) => join(API, file));

describe("API routes", () => {
  it("finds the route files", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes.map((file) => [relative(process.cwd(), file), file]))(
    "%s builds its handlers with jsonRoute",
    (_, file) => {
      expect(readFileSync(file, "utf8")).toMatch(
        /import \{[^}]*\bjsonRoute\b[^}]*\} from "@\/server\/http"/,
      );
    },
  );
});
