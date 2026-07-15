# Campaign attribution verification

Campaign attribution for the early-adopter form is stored in the existing `Prospect.source` field. No schema migration is required.

## Source contract

Direct visits remain:

```text
lims.bot/early-adopter
```

Attributed visits use a deterministic, bounded form:

```text
lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026
```

Only `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` are accepted. Each token is lowercase, at most 48 characters, and limited to letters, digits, `.`, `_`, and `-`. Unexpected parameters, PII-like values, URLs, whitespace, and oversized values are dropped.

The API reconstructs attribution from the same-origin `Referer` query string and independently normalizes any submitted source. Client-side payloads cannot write arbitrary source text.

## Synthetic verification

Do not submit a real production lead merely to test attribution.

1. Run the pure contract suite:

   ```bash
   npm run test:attribution
   ```

2. In a local or preview environment with a mocked/stubbed persistence path, open:

   ```text
   /early-adopter?utm_source=test_campaign&utm_medium=qa&utm_campaign=synthetic
   ```

3. Confirm the API-bound source is:

   ```text
   lims.bot/early-adopter;utm_source=test_campaign;utm_medium=qa;utm_campaign=synthetic
   ```

4. Confirm direct `/early-adopter` still uses the default source.

## Aggregate proof for a real campaign

Use counts only; do not export applicant PII into proof:

```sql
SELECT source, count(*) AS applications
FROM "Prospect"
WHERE source LIKE 'lims.bot/early-adopter;utm_source=cola2026;%'
GROUP BY source
ORDER BY applications DESC, source;
```

For a new campaign, change only the source token in the filter. Reconcile the resulting counts with the campaign URL inventory and external booking analytics; do not infer conversions from missing historical rows.
