// Loads a backend script (CommonJS, run by YouTrack) for unit tests. The package is an ES module
// package, so Node cannot require the scripts directly, and the YouTrack scripting API they
// require only exists inside YouTrack: it is replaced by stubs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ENTITIES = "@jetbrains/youtrack-scripting-api/entities";
const STUB = fileURLToPath(new URL("./stubs/youtrack-entities.cjs", import.meta.url));
const DATE_TIME = "@jetbrains/youtrack-scripting-api/date-time";
const DATE_TIME_STUB = fileURLToPath(new URL("./stubs/youtrack-date-time.cjs", import.meta.url));

// The stub module that loaded scripts get for the entities API; tests may replace its functions.
const ROOT = fileURLToPath(new URL("../", import.meta.url));

export const entitiesStub = createRequire(import.meta.url)(STUB);

export const loadBackendScript = (relativePath) => {
  const file = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const nodeRequire = createRequire(file);
  const stubs = { [ENTITIES]: STUB, [DATE_TIME]: DATE_TIME_STUB };
  // Scripts require each other by relative path (e.g. "./template-utils.js"); load those the same
  // way, since Node would treat them as ES modules.
  const scriptRequire = (id) =>
    id.startsWith("./")
      ? loadBackendScript(
        path.relative(ROOT, path.resolve(path.dirname(file), id.endsWith(".js") ? id : `${id}.js`)),
      )
      : nodeRequire(stubs[id] ?? id);
  const module = { exports: {} };
  const run = vm.compileFunction(fs.readFileSync(file, "utf8"), ["require", "module", "exports"], {
    filename: file,
  });
  run(scriptRequire, module, module.exports);
  return module.exports;
};
