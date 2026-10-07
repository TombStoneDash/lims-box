# Recorded contract fixtures

`samples.json` is a checked-in synthetic response snapshot for the repository's
`AnalysisRequest` contract. It was not captured from a live lab. It contains no
customer records or credentials and is replayed through an injected HTTP
transport. Client, analysis, and pagination fields are deliberately outside
the public summary shape and must never be exposed or followed.

These fixtures prove local contract behavior, not compatibility with an
authenticated live deployment. A deployment must provision a read-only token
accepted as Bearer authentication by its SENAITE API/gateway.
