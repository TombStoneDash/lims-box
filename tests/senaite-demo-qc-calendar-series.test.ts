import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { QCAnalyte } from "../lib/demo-data";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const timeZones = ["UTC", "America/Los_Angeles", "Europe/London"];

function loadQCData(timeZone: string): QCAnalyte[] {
  return JSON.parse(execFileSync(process.execPath, [
    "--import", "tsx", "-e",
    'process.stdout.write(JSON.stringify(require("./lib/demo-data.ts").allQCData));',
  ], {
    cwd: repoRoot,
    env: { ...process.env, TZ: timeZone },
    encoding: "utf8",
    timeout: 10_000,
  }));
}

const utcData = loadQCData("UTC");

for (const timeZone of timeZones) {
  test(`QC series has 90 consecutive calendar days and unchanged values in ${timeZone}`, () => {
    const data = timeZone === "UTC" ? utcData : loadQCData(timeZone);
    assert.equal(data.length, 4);

    for (const analyte of data) {
      const dates = analyte.runs.map(run => run.date);
      assert.equal(dates.length, 90, analyte.name);
      assert.equal(new Set(dates).size, 90, analyte.name);
      assert.equal(dates[0], "2026-01-14", analyte.name);
      assert.equal(dates[89], "2026-04-13", analyte.name);

      // Check every interval, including the US (March 8) and UK (March 29) DST changes.
      for (let i = 1; i < dates.length; i++) {
        assert.equal(
          Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`),
          86_400_000,
          `${analyte.name}: ${dates[i - 1]} -> ${dates[i]}`,
        );
      }
    }

    assert.deepEqual(data, utcData, "dates, values, and analyte ordering match UTC");
    // Snapshot of all seeded numeric results and their order before the calendar fix.
    const values = data.map(({ name, runs }) => ({ name, results: runs.map(run => run.result) }));
    assert.equal(
      createHash("sha256").update(JSON.stringify(values)).digest("hex"),
      "2f9a319b7fa6c9400e633f9f63a0d6832d5d10e4660d7d95e0e570900cdf21d1",
    );
  });
}
