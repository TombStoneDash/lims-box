# Recorded HTTP contract fixtures

`samples.json` stores synthetic response bodies for offline replay through a
real `Response.json()` boundary. Fields and aliases come from the adapter in
closed PR #103 (commit `3328c86c77de417008e11ff036c979b3be649544`) and its merged
synthetic workflow harness. Identifiers and values are fabricated. These are
not captures from a live lab and contain no patient data or credentials.

The three records cover primary wire names, alternative wire names, and absent
optional fields. The analysis field must never appear in normalized summaries.
Malformed and empty payloads are also exercised directly in adapter tests.
No test substitutes these fixtures into a production read path.
