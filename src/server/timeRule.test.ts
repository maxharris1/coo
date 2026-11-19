import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

const eslint = new ESLint();

async function timeViolations(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("forbidden-time rule", () => {
  it.each(["export const t = Date.now();\n", "export const d = new Date();\n"])(
    "flags %j under src/server",
    async (code) => {
      expect(
        await timeViolations(code, "src/server/services/bad.ts"),
      ).toHaveLength(1);
    },
  );

  it.each(["src/server/clock.ts", "src/lib/x.ts"])(
    "allows raw time in %s",
    async (filePath) => {
      const code =
        "export const t = Date.now();\nexport const d = new Date();\n";
      expect(await timeViolations(code, filePath)).toEqual([]);
    },
  );

  it("allows new Date(ms) under src/server", async () => {
    expect(
      await timeViolations(
        "export const d = new Date(0);\n",
        "src/server/services/ok.ts",
      ),
    ).toEqual([]);
  });
});
