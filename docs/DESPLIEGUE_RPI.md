# Despliegue en Raspberry Pi

## Ramas previstas y Entornos Activos

- `release-v1.0-cima`: versión legacy estable de producción.
  - Dominio: `https://cimasalud.duckdns.org`
  - Contenedores: `secretary-legacy-client`, `secretary-legacy-server`, `secretary-legacy-db`.
  - Base de datos: MariaDB real (`clinical_management`) persistida en `/home/cima/server/secretary-legacy/data/database`.
- `main`: versión 2 destinada a producción.
  - Dominio: `https://secretaria.cimasalud.duckdns.org`
  - Contenedores: `secretary-client-prod`, `secretary-server-prod`.
  - Base de datos: Conectada a `secretary-legacy-db` en `proxy-network` (`clinical_management`).
  - Invariante: Tareas en segundo plano deshabilitadas (`ENABLE_BACKGROUND_JOBS=false`) para evitar duplicaciones con legacy.
- `development`: entorno de desarrollo aislado para pruebas y QA.
  - Dominio: `http://dev.cimasalud.duckdns.org`
  - Contenedores: `secretary-client-dev`, `secretary-server-dev`, `secretary-db-dev`.
  - Base de datos: MariaDB aislada (`test_clinical`) persistida en `./data/dev_db`. Ningún cambio afecta los datos productivos.

## Enrutamiento y Reverse Proxy (Nginx Proxy Manager)

Todo el tráfico web entrante por los puertos 80 y 443 es gestionado por `nginx-proxy-manager` (`jc21/nginx-proxy-manager:latest`) conectado a `proxy-network`:
- **Panel de administración:** accesible en el puerto local `81` (vía Tailscale `http://100.115.139.50:81` o túnel SSH `ssh -p 2222 -L 8181:127.0.0.1:81 cima@100.115.139.50`).
- **Mapeo de hosts registrados en NPM (`proxy_host`):**
  - `cimasalud.duckdns.org` ➔ `http://secretary-legacy-client:80` (SSL activo Let's Encrypt).
  - `secretaria.cimasalud.duckdns.org` ➔ `http://secretary-client-prod:80` (SSL activo Let's Encrypt).
  - `dev.cimasalud.duckdns.org` ➔ `http://secretary-client-dev:80` (HTTP directo para desarrollo).

## Automatización de CI/CD

Un push a `main` ejecuta `.github/workflows/deploy.yml`: compila imágenes Docker multi-arquitectura, las publica en GHCR y actualiza en la Raspberry Pi los archivos `docker-compose.prod.yml` y `docker-compose.prod.rpi.yml`.

Un push a `development` ejecuta `.github/workflows/dev.yml`: publica imágenes `dev-*` y actualiza el stack de desarrollo.

## Estado de la base de producción v2

El override de producción conecta el servidor v2 a `secretary-legacy-db` en `proxy-network`, usando `clinical_management`; la MariaDB aislada del Compose base queda bajo el perfil `standalone-db`. V2 desactiva su scheduler y el worker de Google para que legacy siga ejecutando esas tareas compartidas. `DB_ROOT_PASSWORD_PROD` debe coincidir con la credencial root existente de legacy; el cambio no modifica cuentas ni esquema.

El procedimiento completo y las referencias al código están en la [wiki de despliegue](../wiki/flows/rpi-deployment.md).
