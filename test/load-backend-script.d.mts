// Loads a backend script, e.g. "src/template-utils.js", with the YouTrack scripting API stubbed.
export declare const loadBackendScript: (relativePath: string) => unknown;
// The entities API stub shared with loaded scripts; tests may replace its functions.
export declare const entitiesStub: unknown;
