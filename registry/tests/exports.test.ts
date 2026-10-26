// Package surface: the eip712 entry exposes signing data without the Postgres storage layer.

import { execFileSync } from "node:child_process";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const eip712Probe = `
import * as nodeModule from "node:module";

const resolved = [];
if (typeof nodeModule.registerHooks === "function") {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      resolved.push(result.url);
      return result;
    }
  });
}

const entry = await import("@uvp-eth/zhixu-registry/eip712");
if (typeof entry.zhixuRecordTypedData !== "function" || typeof entry.identityClaimTypedData !== "function") {
  throw new Error("eip712 subpath does not export the registry typed-data builders");
}

const require = nodeModule.createRequire(import.meta.url);
const loaded = [
  ...Object.keys(require.cache).filter((path) => path.includes("/node_modules/pg/")),
  ...resolved.filter((url) => url.includes("/node_modules/pg/") || url.includes("/src/postgres/"))
];
if (loaded.length > 0) {
  throw new Error("eip712 subpath loaded the Postgres layer: " + loaded.join(", "));
}
`;

it("imports the eip712 subpath without loading the Postgres layer", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", eip712Probe], {
    cwd: packageRoot,
    encoding: "utf8"
  });
});
