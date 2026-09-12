# Personnel Pack fulfillment security boundary

The Personnel Pack form is a lead-capture workflow, not an access-control boundary. The reviewed PDF is deliberately stored under `public/personnel-pack-assets`, so its URL can be downloaded without submitting the form. The UI and API must not describe the form as authentication, authorization, confidentiality, or proof that every download created a lead.

The API protects fulfillment integrity instead:

- It accepts only accreditation types present in the `PERSONNEL_PACK_PUBLIC_ASSETS` map (currently just the reviewed ISO 15189 selection); an unmapped key fails closed instead of guessing.
- It reads the bundled file and compares its SHA-256 with the reviewed artifact hash before returning a delivery URL or serving bytes.
- It fails closed before returning the URL when asset validation, lead persistence, or the operator notice fails, and fails closed (404/503, never a raw 500) when the download route is hit with an unsupported key or a missing/corrupted file.
- It does not log the applicant email address in diagnostics.
- Applicant-email failure is reported honestly while the already-validated delivery URL remains usable.

The delivered URL points at `GET /api/personnel-pack-download?asset=<key>`, which streams the reviewed bytes with `Content-Disposition: attachment; filename="<stable name>"` and `Cache-Control: private, no-store`. This keeps the filename an applicant sees stable across future asset revisions (the on-disk file may be renamed when the pack is re-reviewed; the download key and displayed filename do not change), and keeps the response out of shared/CDN caches. It does not change the access model below: the route requires no authentication.

Because the asset is public, the PDF must not contain customer data, secrets, or private records. Search engines, caches, logs, and anyone who knows the URL may retrieve it without the lead form. If a future pack requires confidentiality or per-recipient authorization, it must move out of `public` and use a separately reviewed authenticated delivery design; renaming the file or hiding the link is not access control.

The committed `.env.example` intentionally has no `PERSONNEL_PACK_PDF_URL`. The public path and reviewed hash are source-controlled with the fulfillment implementation so configuration drift cannot silently substitute another document.
