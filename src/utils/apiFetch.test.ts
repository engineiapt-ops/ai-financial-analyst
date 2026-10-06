import assert from "node:assert/strict";
import { resolveApiUrl } from "./apiFetch.js";

assert.equal(resolveApiUrl("/api/market/overview", ""), "/api/market/overview");
assert.equal(
  resolveApiUrl("/api/market/overview", "https://api.example.com/"),
  "https://api.example.com/api/market/overview",
);
assert.equal(
  resolveApiUrl("https://api.example.com/api/market/overview", "https://other.example.com"),
  "https://api.example.com/api/market/overview",
);
assert.equal(
  resolveApiUrl(new URL("/api/health", "https://frontend.example.com"), "https://api.example.com"),
  "https://frontend.example.com/api/health",
);

console.log("apiFetch URL resolution tests passed");
