# OHWorks test tenant rollback

The existing pilot remains on `127.0.0.1:3217`. The replacement runs separately
on `127.0.0.1:3218`, with its own versioned image and persistent data directory.

To roll back customer traffic, restore the preserved Caddyfile and reload Caddy:

```sh
cp /opt/limsbox/gateway/Caddyfile.pre-test-tenant-r14 /opt/limsbox/gateway/Caddyfile
docker exec limsbox-public-gateway caddy reload --config /etc/caddy/Caddyfile
```

Verify the public route, then stop only the replacement if required:

```sh
cd /opt/limsbox/test-tenant-r14
OHWORKS_IMAGE="$(cat image-tag.txt)" docker compose down
```

Do not remove the replacement data directory, image, old pilot container, or
SENAITE volumes during routine rollback.
