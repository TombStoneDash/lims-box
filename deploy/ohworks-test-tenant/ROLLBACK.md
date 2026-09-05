# Source-only candidate boundary and rollback

This directory is an unactivated candidate. It does not alter the existing
pilot, public Caddy configuration, DNS, running SENAITE service, or SENAITE
data volume. The web service joins the existing private SENAITE network and
the candidate proxy publishes only an explicitly selected loopback port.

The SENAITE image must remain the separately verified, pinned image containing
the installed security backport. This candidate neither rebuilds nor replaces
that image. The OHWorks bundle mounted at `/run/ohworks-bundle` must come from
the clean checksum-bound source head
`bcc97cc5df73941c3e34171e67a64b552e13425e`.

No rollback action is required for source review because nothing is activated.
If a later separately authorized private test starts this compose project,
rollback is limited to stopping `ohworks-senaite-candidate`; do not remove the
personnel volume, SENAITE volume, images, or the existing pilot.
