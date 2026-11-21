import { expect, it } from "vitest";
import { makeTestDeps } from "@/test/deps";
import { deliver } from "./deliver";

it("does not push yet", async () => {
  const deps = await makeTestDeps();
  expect(await deliver(deps, crypto.randomUUID())).toEqual({ pushed: false });
});
