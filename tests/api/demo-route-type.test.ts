import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../app/api/demo/route";

const supportedTypes = ["samples", "results", "qc", "coc", "methods"];
const notice = "This is synthetic demo data. No real laboratory results are represented.";

async function requestType(type?: string) {
  const url = new URL("http://localhost/api/demo");
  if (type !== undefined) url.searchParams.set("type", type);
  return GET(new Request(url));
}

for (const type of [undefined, ""]) {
  test(`type ${JSON.stringify(type)} defaults to samples`, async () => {
    const response = await requestType(type);
    assert.equal(response.status, 200);
    const body = await response.json();
    const explicit = await (await requestType("samples")).json();
    assert.deepEqual(body, explicit);
    assert.equal(body.type, "samples");
    assert.equal(body.count, 10);
  });
}

const shapes = [
  { type: "samples", count: 10, keys: ["id", "type", "client", "collected", "received", "status", "priority", "holding_time_expires", "analyst", "methods"] },
  { type: "results", count: 10, keys: ["sample_id", "analyte", "method", "result", "units", "mdl", "rl", "mcl", "status", "analyzed_at"] },
  { type: "qc", count: 6, keys: ["batch_id", "method", "type", "analyte", "result", "acceptance", "status", "analyst", "run_date"] },
  { type: "coc", count: 3, keys: ["coc_id", "sample_ids", "client", "collected_by", "collection_date", "received_by", "received_date", "temp_on_receipt", "temp_acceptable", "custody_seals_intact", "preservation_correct", "comments"] },
  { type: "methods", count: 5, keys: ["id", "name", "title", "analytes", "matrix", "holding_time_days", "preservation", "qc_requirements"] },
];

for (const { type, count, keys } of shapes) {
  test(`${type} retains its successful response shape`, async () => {
    const response = await requestType(type);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["demo", "description", "type", "count", "data", "_links", "_note"].sort());
    assert.equal(body.demo, true);
    assert.equal(body.type, type);
    assert.equal(body.count, count);
    assert.equal(body.data.length, count);
    assert.equal(typeof body.description, "string");
    assert.ok(body.description.length > 0);
    assert.equal(body._note, notice);
    assert.deepEqual(body._links, Object.fromEntries(supportedTypes.map(value => [value, `/api/demo?type=${value}`])));
    for (const record of body.data) {
      assert.deepEqual(Object.keys(record).sort(), [...keys].sort());
    }
  });
}

const invalidTypes = [
  "typo", "resutls", "sample", " ", "\t\n", " results", "results ",
  ...supportedTypes.flatMap(type => [type.toUpperCase(), type[0].toUpperCase() + type.slice(1)]),
];

for (const type of invalidTypes) {
  test(`unsupported type ${JSON.stringify(type)} returns an actionable error without records`, async () => {
    const response = await requestType(type);
    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body = await response.json();
    assert.equal(typeof body.error, "string");
    assert.match(body.error, /type/i);
    for (const supported of supportedTypes) assert.ok(body.error.includes(supported));
    assert.equal("data" in body, false);
    assert.equal("count" in body, false);
    assert.equal("type" in body, false);
  });
}
