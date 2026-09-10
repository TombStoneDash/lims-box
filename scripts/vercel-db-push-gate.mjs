import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function shouldPushDatabase(vercelEnv) {
  return vercelEnv === "production";
}
export function runDatabaseGate(options = {}) {
  // Only read process.env when the caller did not supply vercelEnv at all.
  // A destructuring default would also apply to an explicit `undefined`,
  // which made the "unset environment" test read VERCEL_ENV=production on
  // the Vercel build box and fail the production build.
  const vercelEnv = Object.hasOwn(options, "vercelEnv") ? options.vercelEnv : process.env.VERCEL_ENV;
  const exec = options.exec ?? execFileSync;

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
