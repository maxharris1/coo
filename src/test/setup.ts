import { afterAll, afterEach, beforeEach } from "vitest";
import { closeFileScope, closeTestScope, startTestScope } from "./testDb";

beforeEach(startTestScope);
afterEach(closeTestScope);
afterAll(closeFileScope);
