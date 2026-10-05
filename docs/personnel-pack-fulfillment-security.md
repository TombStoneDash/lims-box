# Personnel Pack fulfillment security boundary

The Personnel Pack form is a lead-capture workflow, not an access-control boundary. The reviewed PDF is deliberately stored under `public/personnel-pack-assets`, so its URL can be downloaded without submitting the form. The UI and API must not describe the form as authentication, authorization, confidentiality, or proof that every download created a lead.

The API protects fulfillment integrity instead:

- It accepts only accreditation types present in the `PERSONNEL_PACK_PUBLIC_ASSETS` map (currently just the reviewed ISO 15189 selection); an unmapped key fails closed instead of guessing.
- It reads the bundled file and compares its SHA-256 with the reviewed artifact hash before returning a delivery URL or serving bytes.
- It fails closed before returning the URL when asset validation or lead persistence fails, and fails closed (404/503, never a raw 500) when the download route is hit with an unsupported key or a missing/corrupted file.
- It does not log the applicant email address in diagnostics.
- Operator-notice failure emits a redacted diagnostic and does not block applicant delivery or the verified download.
- Applicant-email failure is reported honestly while the already-validated delivery URL remains usable.

The delivered URL points at `GET /api/personnel-pack-download?asset=<key>`, which streams the reviewed bytes with `Content-Disposition: attachment; filename="<stable name>"` and `Cache-Control: private, no-store`. This keeps the filename an applicant sees stable across future asset revisions (the on-disk file may be renamed when the pack is re-reviewed; the download key and displayed filename do not change), and keeps the response out of shared/CDN caches. It does not change the access model below: the route requires no authentication.

Because the asset is public, the PDF must not contain customer data, secrets, or private records. Search engines, caches, logs, and anyone who knows the URL may retrieve it without the lead form. If a future pack requires confidentiality or per-recipient authorization, it must move out of `public` and use a separately reviewed authenticated delivery design; renaming the file or hiding the link is not access control.

The committed `.env.example` intentionally has no `PERSONNEL_PACK_PDF_URL`. The public path and reviewed hash are source-controlled with the fulfillment implementation so configuration drift cannot silently substitute another document.

## One-time download links

Emailed links carry `?asset=<key>&claim=<token>`. The claim is signed, expires after 15 minutes, and works once.

- `GET` with a claim only checks it (signature, expiry, asset) and returns a small confirm page. It never uses the claim up, so mail security scanners and link previews that open the link do not spend it.
- The page's button `POST`s to `/api/personnel-pack-download/claim`, which uses the claim up (an atomic insert into `PersonnelPackDownloadClaim`) and returns the PDF.
- A missing `PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET` or an unavailable claim store fails closed with 503.
- A browser (`Accept: text/html`) that opens an expired or already-used link, or presses Download on one, gets a readable page with a "Request a new link" button to `/personnel-pack`, with the same 401/503 status. Other callers keep the JSON error. The page never echoes the claim.
- The bare `?asset=<key>` address stays public, as above.

