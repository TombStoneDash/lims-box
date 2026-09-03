# Gary question-answer matrix

This matrix captures approved answers for likely supervised-demo questions. It
separates confirmed local facts from assumptions and discovery gates.

## Discovery-only hypothesis

| Likely question | Approved answer |
|---|---|
| Are LIAISON XL and Orchidlive already connected to LIMS BOX? | No supported live connection is shown here. The demo presents `LIAISON XL -> Orchidlive -> LIMS BOX` as an unverified discovery hypothesis only. |
| What transport or protocol do they use? | Not confirmed. The next step is supplier discovery for topology, protocol, transport, versions, interface guide, and sample messages. |
| Can you configure the adapter now? | Not from this packet. Unsupported configuration advice is intentionally refused until supplier-approved material exists. |

## Confirmed local demo behavior

| Likely question | Approved answer |
|---|---|
| What can the demo prove today? | A synthetic fail-closed workflow, role-filtered views, deterministic assistant answers, and visible discovery gates. |
| Can employer views see analyte values? | No. Employer and worker roles are outcome-only in this synthetic tenant. |
| What is required before release? | A distinct authorized technical-review event must exist before release. |

## Discovery gates still open

| Topic | Required follow-up |
|---|---|
| Topology | Supplier-confirmed architecture and source-of-truth ownership |
| Versions | Exact analyzer, Orchidlive, and interface package versions |
| Messages | Sanitized or synthetic sample messages for parser and mapping validation |
| Licensing | Contractual right to access, forward, or transform interface data |
| Replay and errors | Exact acknowledgement, retry, duplicate, and quarantine behavior |
