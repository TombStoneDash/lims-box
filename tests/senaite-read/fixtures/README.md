# Recorded contract fixtures

`samples.json` is a checked-in synthetic response snapshot for the repository's
`AnalysisRequest` contract. It was not captured from a live lab. It contains no
customer records or credentials and is replayed through an injected HTTP
transport. Client, analysis, and pagination fields are deliberately outside
the public summary shape and must never be exposed or followed.

These fixtures prove local contract behavior, not compatibility with an
authenticated live deployment. A deployment must provision a read-only token
accepted as Bearer authentication by its SENAITE API/gateway.

## Recorded from a real SENAITE server

`recorded/senaite-2.6.0-anonymous.json` holds real responses from SENAITE 2.6.0
(`senaite.jsonapi` v1), captured 2026-10-21 from the LIMS BOX environmental demo
container. That server holds synthetic demo data only. The capture was a set of
anonymous GETs over loopback on the demo host, with no login and no credentials:
`version`, `users/current` with no header and with `Bearer recorded-invalid-token`,
the adapter's exact `AnalysisRequest` query with that invalid token, and an
unknown `AnalysisRequest/<id>` path. Response bodies are kept as served, except
that the loopback origin is replaced with `https://senaite.recorded.invalid`.

The recording shows that SENAITE answers an invalid token with HTTP 200, as
Anonymous, with an empty sample list, and sends some errors as HTTP 200 with
`success: false`. It has no sample records. A signed-in recording needs a
read-only account on a synthetic-data server.
