# Despliegue en Raspberry Pi

## Stack v2 activo

El workflow de `development` despliega el stack v2 de la Raspberry Pi mediante `docker-compose.yml` y `docker-compose.rpi.yml`. El override conecta `server` al contenedor existente `secretary-legacy-db` por la red externa `proxy-network` y selecciona `clinical_management`.

El servicio `db` de desarrollo queda bajo el perfil `standalone-db`; el servidor no depende de esa base durante el despliegue en la Raspberry. `DB_USER` y `DB_PASSWORD` se siguen leyendo del `.env` existente, sin crear ni cambiar cuentas o contraseñas. La base compartida conserva su esquema y datos; este cambio no ejecuta migraciones.

`ENABLE_BACKGROUND_JOBS=false` evita que v2 procese los mismos trabajos programados y la cola de sincronización que legacy. La aplicación conserva sus listeners para eventos de solicitudes que procesa directamente.

## Verificación después del despliegue

Antes de considerar resuelto el cambio, comprobar en la Raspberry, con consultas de solo lectura, que `server` resuelve `secretary-legacy-db`, usa `clinical_management` y puede ejecutar `SELECT 1`. Confirmar también el healthcheck HTTP del backend v2. No ejecutar migraciones ni modificar cuentas o datos durante esta verificación.
