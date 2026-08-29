# Personnel Pack fulfillment security boundary

The Personnel Pack form is a lead-capture workflow, not an access-control boundary. The reviewed PDF is deliberately stored under `public/personnel-pack-assets`, so its URL can be downloaded without submitting the form. The UI and API must not describe the form as authentication, authorization, confidentiality, or proof that every download created a lead.

The API protects fulfillment integrity instead:

- It accepts only the reviewed ISO 15189 selection.
- It reads the bundled file and compares its SHA-256 with the reviewed artifact hash before returning the public URL.
- It fails closed before returning the URL when asset validation, lead persistence, or the operator notice fails.
- It does not log the applicant email address in diagnostics.
- Applicant-email failure is reported honestly while the already-validated public URL remains usable.

Because the asset is public, the PDF must not contain customer data, secrets, or private records. Search engines, caches, logs, and anyone who knows the URL may retrieve it without the lead form. If a future pack requires confidentiality or per-recipient authorization, it must move out of `public` and use a separately reviewed authenticated delivery design; renaming the file or hiding the link is not access control.

The committed `.env.example` intentionally has no `PERSONNEL_PACK_PDF_URL`. The public path and reviewed hash are source-controlled with the fulfillment implementation so configuration drift cannot silently substitute another document.
