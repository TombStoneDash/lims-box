import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { QCAnalyte } from "../lib/demo-data";

const fixturePath = fileURLToPath(new URL("../lib/demo-data.ts", import.meta.url));
const timezones = ["UTC", "America/Los_Angeles", "Europe/London"];

function loadQCData(timezone: string): QCAnalyte[] {
  // Set TZ at process startup, before tsx loads the actual fixture module.
  const output = execFileSync(
    process.execPath,
    [
      "--import", "tsx", "--eval",
      `process.stdout.write(JSON.stringify(require(${JSON.stringify(fixturePath)}).allQCData));`,
    ],
    { env: { ...process.env, TZ: timezone }, encoding: "utf8", timeout: 30_000 },
  );
  return JSON.parse(output);
}

const fixtures = timezones.map((timezone) => ({ timezone, data: loadQCData(timezone) }));

test("QC dates, numerical results, and metadata are identical across timezones", () => {
  for (const { timezone, data } of fixtures) {
    assert.deepEqual(data, fixtures[0].data, timezone);
  }
});

for (const { timezone, data } of fixtures) {
  test(`QC calendar has 90 unique consecutive dates for every analyte in ${timezone}`, () => {
    assert.equal(data.length, 4);
    for (const analyte of data) {
      const dates = analyte.runs.map((run) => run.date);
      assert.equal(dates.length, 90, analyte.name);
      assert.equal(new Set(dates).size, 90, analyte.name);
      assert.equal(dates[0], "2026-01-14", analyte.name);
      assert.equal(dates.at(-1), "2026-04-13", analyte.name);
      for (let i = 1; i < dates.length; i++) {
        assert.equal(
          Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`),
          86_400_000,
          `${analyte.name}: ${dates[i - 1]} to ${dates[i]}`,
        );
      }
    }
  });
}
