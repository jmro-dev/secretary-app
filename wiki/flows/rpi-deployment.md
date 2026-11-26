---
title: Raspberry Pi Build and Deployment Flow
type: flow
responsibility: GitHub Actions build and deploy the main production and development Docker stacks on the Raspberry Pi.
sources:
  - .github/workflows/deploy.yml
  - .github/workflows/dev.yml
  - docker-compose.prod.yml
  - docker-compose.prod.rpi.yml
  - docker-compose.yml
  - server/app.js
synced: 41f85285
sources_key: c94a0d2cacbe
confidence: high
related:
  - ../architecture.md
  - ../components/server.md
generated: { by: codex/gpt-6, at: 2026-11-25T16:30:00Z }
---

# Raspberry Pi Build and Deployment Flow

The repository has separate GitHub Actions paths for production (`main`) and development (`development`). Each builds Docker images in GitHub Actions, pushes them to GHCR, then updates the corresponding Compose stack on the Raspberry Pi.

## Production on `main`

1. A push to `main` builds multi-architecture server, client, AI service and WhatsApp bridge images, tagging them as `latest` and with the commit SHA ([deploy.yml:3-7](../../.github/workflows/deploy.yml#L3), [deploy.yml:57-66](../../.github/workflows/deploy.yml#L57)).
2. The SSH deploy step updates the remote `main` checkout, pulls `docker-compose.prod.yml` images and starts that stack ([deploy.yml:68-89](../../.github/workflows/deploy.yml#L68)).
3. The Raspberry Pi override uses the existing `proxy-network` connection to point `server-prod` at `secretary-legacy-db` and `clinical_management`. It leaves the isolated `db-prod` service behind the `standalone-db` profile, so the main deployment does not start a second database ([docker-compose.prod.rpi.yml:1-13](../../docker-compose.prod.rpi.yml#L1), [docker-compose.prod.yml:30-46](../../docker-compose.prod.yml#L30), [docker-compose.prod.yml:155-161](../../docker-compose.prod.yml#L155)).
4. The v2 backend disables its scheduler and Google sync worker in this shared-database deployment; legacy remains the backend responsible for those jobs ([docker-compose.prod.rpi.yml:6-12](../../docker-compose.prod.rpi.yml#L6), [server/app.js:44-63](../../server/app.js#L44), [server/app.js:166-177](../../server/app.js#L166)).

## Development on `development`

1. A push to `development`, or a manual workflow run, builds and publishes images tagged `dev-latest` and `dev-<sha>` ([dev.yml:3-7](../../.github/workflows/dev.yml#L3), [dev.yml:58-67](../../.github/workflows/dev.yml#L58)).
2. The SSH job updates the remote `development` checkout and restarts the stack using `docker-compose.yml` ([dev.yml:69-97](../../.github/workflows/dev.yml#L69)).
3. That Compose file runs a separate MariaDB container named `secretary-db-dev`, persists it under `./mysql_data`, and points the development server at the `db` service ([docker-compose.yml:11-31](../../docker-compose.yml#L11), [docker-compose.yml:40-57](../../docker-compose.yml#L40)).

The production workflow applies the Raspberry Pi override, while the development workflow keeps using its own MariaDB. 

## Active Multi-Environment Architecture & Reverse Proxy

All ingress web traffic (ports 80 and 443) on the Raspberry Pi is routed through **Nginx Proxy Manager** (`nginx-proxy-manager` container on `proxy-network`):

1. **Legacy Production (`https://cimasalud.duckdns.org`):**
   - Routes to `secretary-legacy-client:80`.
   - Connected to `secretary-legacy-db` (`clinical_management`).
   - Runs full background scheduling and Google sync.

2. **V2 Production (`https://secretaria.cimasalud.duckdns.org`):**
   - Routes to `secretary-client-prod:80`.
   - Connected to shared `secretary-legacy-db` (`clinical_management`).
   - Runs with `ENABLE_BACKGROUND_JOBS=false` to prevent duplicate worker execution.

3. **Isolated Development (`http://dev.cimasalud.duckdns.org`):**
   - Routes to `secretary-client-dev:80`.
   - Connected to isolated `secretary-db-dev` (`test_clinical` database stored in `./data/dev_db`).
   - Modifying data in this environment has zero impact on the live clinical database.
