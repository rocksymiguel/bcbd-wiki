# Public API, read-only

GitHub Pages hosts the static wiki, GIS layers and coupling viewer. A separate
gateway on the VM publishes only GET requests to the existing environmental
connector: health, station, weather and tides. It has no database mount and does
not serve the LAN website, observations, media, participants, results, sessions,
source files or administration. All other paths return 404; writes return 405.
CORS permits the GitHub Pages origin without credentials. The LAN stack remains
unchanged and continues using its private databases and local registration UI.

Deployment: copy these two configuration files to `/home/bcbdadmin/public-api`,
validate the Caddyfile, then run `docker compose -p bcbd-public-api up -d` there.
The gateway listens on VM loopback only, `127.0.0.1:8010`, and connects to the
existing `bcbd-gis-private` network. Do not tunnel port 80 or the original API
containers: they include private/writable routes.

Use the existing Tailscale container to expose this gateway through HTTPS:
`docker exec bcbd-tailscale tailscale funnel --bg http://127.0.0.1:8010`.
Funnel may require the account owner to enable HTTPS/Funnel in the linked admin
console. The hostname belongs to the current Tailscale node and is configured
in `js/layout.js`. No purchased domain is required. Availability depends on the
VM, internet connection, Tailscale account and service; Funnel has bandwidth
limits. Disable this gateway's Funnel with `tailscale funnel --https=443 off`
(do not reset unrelated Tailscale configuration).

GitHub Pages explicitly hides registration/uploads and does not request the LAN
databases. Map visual preferences remain per browser; meteorological and tide
readings come from the same VM connector, with their original dates, source
labels, caches and refresh intervals. This is not a live flood simulation.

Verify the HTTPS health endpoint, real station/weather/tide reads, CORS from the
GitHub origin, denied writes and private paths, and actual browser fetches.
`node tools/tests/public-readonly.cjs` checks the public site mode on a local
GitHub-hostname simulation, including degraded environmental sources.
`BCBD_PUBLIC_API_URL=https://bcbd-wiki.tail4eb990.ts.net` also checks real
cross-origin browser reads and the gateway's HTTPS/CORS and denial responses.
`verify-gateway.py URL` checks the allowlist without submitting any real data.
