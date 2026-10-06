// Compatibility facade: new domain code should import trading types from ./domain/trading.js.
// The legacy path remains available so the migration can be incremental and behavior-neutral.
export * from "./domain/trading.js";

// Compatibility bridge for the React presentation layer.
export * from "./types/index.js";
