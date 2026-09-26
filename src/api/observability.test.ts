import { strict as assert } from "node:assert";
import { logApiEvent } from "./observability.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalFlag = process.env.OBSERVABILITY_LOGS;

process.env.NODE_ENV = "test";
process.env.OBSERVABILITY_LOGS = "true";

assert.equal(typeof logApiEvent, "function");

process.env.OBSERVABILITY_LOGS = "false";
process.env.NODE_ENV = originalNodeEnv;
if (originalFlag === undefined) delete process.env.OBSERVABILITY_LOGS;
else process.env.OBSERVABILITY_LOGS = originalFlag;

console.log("observability tests passed");
