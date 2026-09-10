import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function shouldPushDatabase(vercelEnv) {
  return vercelEnv === "production";
}
export function runDatabaseGate({ vercelEnv = process.env.VERCEL_ENV, exec = execFileSync } = {}) {
  if (!shouldPushDatabase(vercelEnv)) {
    console.log(`[vercel-db-gate] skipping database push for ${vercelEnv || "non-Vercel"} build`);
    return "skipped";
  }

  exec("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit" });
  return "pushed";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDatabaseGate();
}
