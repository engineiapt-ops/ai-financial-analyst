import { strict as assert } from "node:assert";
import {
  parseEnvBoolean,
  parseEnvNumber,
  parseEnvUrl,
  parseStrictBoolean,
  trimEnvValue,
} from "./env.js";

assert.equal(trimEnvValue(undefined), undefined);
assert.equal(trimEnvValue("  "), undefined);
assert.equal(trimEnvValue("  value  "), "value");

assert.equal(parseEnvNumber(undefined), undefined);
assert.equal(parseEnvNumber(" 1.25 "), 1.25);
assert.equal(parseEnvNumber("abc"), undefined);
assert.equal(parseEnvNumber("-1", { min: 0 }), undefined);
assert.equal(parseEnvNumber("2", { max: 1 }), undefined);

assert.equal(parseEnvBoolean("TRUE"), true);
assert.equal(parseEnvBoolean("off"), false);
assert.equal(parseEnvBoolean("1"), true);
assert.equal(parseEnvBoolean("unexpected"), undefined);

assert.equal(parseStrictBoolean("true"), true);
assert.equal(parseStrictBoolean("false"), false);
assert.equal(parseStrictBoolean("1"), undefined);

assert.equal(parseEnvUrl("https://example.com", ["http:", "https:"])?.protocol, "https:");
assert.equal(parseEnvUrl("wss://example.com", ["ws:", "wss:"])?.protocol, "wss:");
assert.equal(parseEnvUrl("not-a-url", ["http:", "https:"]), undefined);
assert.equal(parseEnvUrl("ftp://example.com", ["http:", "https:"]), undefined);

console.log("configuration parser tests passed");
