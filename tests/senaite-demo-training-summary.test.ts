import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextTrainingExpiration,
  staff,
  trainingSummary,
  TRAINING_SUMMARY_AS_OF_DATE,
  type Staff,
} from "../lib/demo-data";

test("trainingSummary matches the earliest competency in the synthetic staff registry", () => {
  const result = getNextTrainingExpiration(staff, TRAINING_SUMMARY_AS_OF_DATE);
  assert.ok(result);
  assert.equal(result!.staffName, "Julia Martinez");
  assert.equal(result!.competencyName, "EPA 200.8 (ICP-MS Metals)");
  assert.equal(result!.expirationDate, "2026-05-01");
  assert.equal(trainingSummary.nextExpirationName, "EPA 200.8 (ICP-MS Metals) — J. Martinez");
  assert.equal(trainingSummary.nextExpiration, "May 01, 2026");
});

test("ties on expirationDate resolve deterministically by staff name then competency name", () => {
  const tiedStaff: Staff[] = [
    {
      name: "Zoe Adams",
      role: "Analyst",
      employeeId: "EMP-1",
      hireDate: "2020-01-01",
      signatureEnabled: false,
      competencies: [
        { name: "Zebra Cert", certifiedDate: "2024-01-01", expirationDate: "2026-06-01", status: "Current", assessedBy: "X" },
      ],
    },
    {
      name: "Amy Baker",
      role: "Analyst",
      employeeId: "EMP-2",
      hireDate: "2020-01-01",
      signatureEnabled: false,
      competencies: [
        { name: "Alpha Cert", certifiedDate: "2024-01-01", expirationDate: "2026-06-01", status: "Current", assessedBy: "X" },
      ],
    },
  ];

  const result = getNextTrainingExpiration(tiedStaff, "2026-04-13");
  assert.ok(result);
  assert.equal(result!.staffName, "Amy Baker");
  assert.equal(result!.competencyName, "Alpha Cert");

  const sameStaffTie: Staff[] = [
    {
      name: "Amy Baker",
      role: "Analyst",
      employeeId: "EMP-2",
      hireDate: "2020-01-01",
      signatureEnabled: false,
      competencies: [
        { name: "Zebra Cert", certifiedDate: "2024-01-01", expirationDate: "2026-06-01", status: "Current", assessedBy: "X" },
        { name: "Alpha Cert", certifiedDate: "2024-01-01", expirationDate: "2026-06-01", status: "Current", assessedBy: "X" },
      ],
    },
  ];
  const sameStaffResult = getNextTrainingExpiration(sameStaffTie, "2026-04-13");
  assert.equal(sameStaffResult!.competencyName, "Alpha Cert");
});

test("days remaining is a stable, non-negative integer count from the fixed as-of date", () => {
  const singleStaff: Staff[] = [
    {
      name: "Test Person",
      role: "Analyst",
      employeeId: "EMP-9",
      hireDate: "2020-01-01",
      signatureEnabled: false,
      competencies: [
        { name: "Future Cert", certifiedDate: "2024-01-01", expirationDate: "2026-05-01", status: "Current", assessedBy: "X" },
      ],
    },
  ];

  const result = getNextTrainingExpiration(singleStaff, "2026-04-13");
  assert.equal(result!.daysRemaining, 18);
  assert.equal(Number.isInteger(result!.daysRemaining), true);

  const rerun = getNextTrainingExpiration(singleStaff, "2026-04-13");
  assert.equal(rerun!.daysRemaining, result!.daysRemaining);
});

test("an already-expired competency clamps to zero days remaining, never negative", () => {
  const pastStaff: Staff[] = [
    {
      name: "Test Person",
      role: "Analyst",
      employeeId: "EMP-9",
      hireDate: "2020-01-01",
      signatureEnabled: false,
      competencies: [
        { name: "Lapsed Cert", certifiedDate: "2020-01-01", expirationDate: "2026-01-01", status: "Expired", assessedBy: "X" },
      ],
    },
  ];

  const result = getNextTrainingExpiration(pastStaff, "2026-04-13");
  assert.equal(result!.daysRemaining, 0);
});

test("empty staff input fails closed to null instead of guessing a date", () => {
  assert.equal(getNextTrainingExpiration([], "2026-04-13"), null);

  const noCompetencies: Staff[] = [
    { name: "No Comp Person", role: "Analyst", employeeId: "EMP-0", hireDate: "2020-01-01", signatureEnabled: false, competencies: [] },
  ];
  assert.equal(getNextTrainingExpiration(noCompetencies, "2026-04-13"), null);
});
