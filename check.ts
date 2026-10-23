import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const output = "apps/agent/.mastra/output";

const tarballs = existsSync(join(output, "workspace-module"))
  ? readdirSync(join(output, "workspace-module"))
  : [];
const dependencies = JSON.parse(readFileSync(join(output, "package.json"), "utf8")).dependencies;
const runtimeImports = readdirSync(output)
  .filter((file) => file.endsWith(".mjs"))
  .filter((file) => /(?:from|import)\s*\(?\s*["']@repro\/heavy/.test(readFileSync(join(output, file), "utf8")));
// pnpm installs a dependency of a packed workspace package under node_modules/.pnpm.
const s3Installed = readdirSync(join(output, "node_modules/.pnpm")).some((entry) =>
  entry.startsWith("@aws-sdk+client-s3@"),
);

console.log(`workspace-module/:                 ${JSON.stringify(tarballs)}`);
console.log(`package.json @repro/heavy:         ${dependencies["@repro/heavy"] ?? "(absent)"}`);
console.log(`output files importing it:        ${JSON.stringify(runtimeImports)}`);
console.log(`@aws-sdk/client-s3 installed:      ${s3Installed ? "yes" : "no"}`);
console.log();

if (runtimeImports.length === 0 && (tarballs.length > 0 || s3Installed)) {
  console.log("BUG: @repro/heavy is inlined into the bundle, yet it is packed and installed");
  console.log("     with its dependencies, which nothing in the output imports.");
  process.exitCode = 1;
} else {
  console.log("OK: only workspace packages the bundle imports at runtime are installed.");
}
