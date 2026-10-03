/**
 * Personnel survey-export file naming — shared by the survey-export route
 * (which may only export `GET`/route config, not helper functions) and by
 * the route's regression tests.
 */

import { createHash } from "node:crypto";

type PersonNameId = { id: string; name: string };

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Short, opaque tag from a person's record id (no personal data), so a file name
// is tied to the person, not to the order the database returns records in.
function idTag(id: string, length = 8): string {
  return createHash("sha256").update(id).digest("hex").slice(0, length);
}

// Two people can slug to the same (or empty) base — e.g. duplicate names, or a
// name with no ASCII letters. A unique name keeps personnel/<slug>.pdf. Everyone
// whose base collides gets personnel/<slug>-<id tag>.pdf, so no PDF overwrites
// another. Names are assigned in record-id order, never fetch order, so even the
// rare leftover clash (a name that equals another person's tagged name, or two ids
// sharing a tag) resolves the same way in every export.
export function buildPersonnelFileNames<T extends PersonNameId>(people: T[]): string[] {
  const baseOf = (p: PersonNameId) => slug(p.name) || "person";
  const counts = new Map<string, number>();
  for (const p of people) counts.set(baseOf(p), (counts.get(baseOf(p)) ?? 0) + 1);
  const used = new Set<string>();
  const byId = new Map<string, string>();
  for (const p of [...people].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const base = baseOf(p);
    let candidate = counts.get(base) === 1 ? `personnel/${base}.pdf` : `personnel/${base}-${idTag(p.id)}.pdf`;
    for (let length = 12; used.has(candidate) && length <= 64; length += 4) {
      candidate = `personnel/${base}-${idTag(p.id, length)}.pdf`;
    }
    // sha256 has only 64 hex characters; past that, a counter always finds a free name.
    for (let n = 2; used.has(candidate); n++) {
      candidate = `personnel/${base}-${idTag(p.id, 64)}-${n}.pdf`;
    }
    used.add(candidate);
    byId.set(p.id, candidate);
  }
  return people.map((p) => byId.get(p.id) as string);
}
