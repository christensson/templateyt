// Loads a backend script (CommonJS, run by YouTrack) for unit tests. The package is an ES module
// package, so Node cannot require the scripts directly, and the YouTrack scripting API they
// require only exists inside YouTrack: it is replaced by a stub.
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ENTITIES = "@jetbrains/youtrack-scripting-api/entities";
const STUB = fileURLToPath(new URL("./stubs/youtrack-entities.cjs", import.meta.url));

// The stub module that loaded scripts get for the entities API; tests may replace its functions.
export const entitiesStub = createRequire(import.meta.url)(STUB);

export const loadBackendScript = (relativePath) => {
  const file = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const nodeRequire = createRequire(file);
  const scriptRequire = (id) => nodeRequire(id === ENTITIES ? STUB : id);
  const module = { exports: {} };
  const run = vm.compileFunction(fs.readFileSync(file, "utf8"), ["require", "module", "exports"], {
    filename: file,
  });
  run(scriptRequire, module, module.exports);
  return module.exports;
};
