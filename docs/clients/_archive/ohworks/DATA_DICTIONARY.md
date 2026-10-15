# Synthetic pilot data dictionary

All example values are invented and must remain so until customer-data authority and controls exist.

| Entity | Field | Meaning | Control |
|---|---|---|---|
| Pilot metadata | `annualVolumeRange` | Customer-reported planning range | Labelled as unverified; not used for a capacity claim |
| Sample | `id` | Synthetic accession identifier | Prefix `OW-SYN-`; never a customer identifier |
| Sample | `panel` | Invented panel display name | Not a customer test catalogue |
| Sample | `state` | Workflow state | Accessioned, queued, instrument result, technical review, or released |
| Sample | `flag` | Demonstration exception or review state | Does not represent a clinical interpretation |
| Mapping | `instrumentCode` | Synthetic source code | `DISCOVERY-REQ` represents an intentionally missing mapping |
| Mapping | `canonicalTest` | Synthetic canonical display name | Requires approved customer mapping before real use |
| Personnel | `id` | Synthetic staff identifier | Prefix `SYN-P`; invented person |
| Personnel | `competency` | Demonstration competence area | Not real training or authorization evidence |
| Audit event | `actor` | Synthetic person or system actor | Append-only behavior is conceptual in this read-only increment |
| Audit event | `object` | Synthetic affected object | Contains no customer or patient content |

## Future minimum interface record

A real interface record would need message fingerprint, received timestamp, transport metadata, parser version, mapping version, source identifiers, structured values, quarantine state, review actions, and release decision. Exact fields and retention cannot be finalized until the analyzer and governance discovery gates close.
