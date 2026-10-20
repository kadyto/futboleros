# Instalación y mantenimiento

## Stack en Dockhand

Usa [compose.dockhand.yaml](../compose.dockhand.yaml). El contexto de construcción apunta al repositorio público y su rama `main`; Dockhand necesita acceso a GitHub para construirlo. Usa Docker Compose v2 con soporte de contextos Git.

1. Crea un stack llamado `futboleros`.
2. Pega el compose completo.
3. Define `ADMIN_PASSWORD` en las variables de Dockhand con una contraseña propia de al menos 12 caracteres. Opcionalmente define `APP_PORT` para cambiar el puerto 8093.
4. Construye y despliega. Cuando termine, el contenedor debe aparecer como saludable.
5. Abre `/admin`, inicia sesión, revisa el equipo y pulsa **Guardar equipo público**. Comparte después la dirección principal. Los visitantes no necesitan la contraseña.

Si Dockhand pide seleccionar una imagen existente, elige el modo de construcción del stack. Este despliegue construye el código del repositorio; no depende de una imagen prepublicada en otro registro.

El volumen gestionado evita depender de rutas del servidor. La imagen crea `/data` con el propietario correcto antes de usar el usuario sin privilegios `node` (UID 1000). No añadas `user: root` ni cambies permisos a `777`.

## Instalación desde una carpeta

```sh
git clone https://github.com/kadyto/futboleros.git
cd futboleros
cp .env.example .env
# Edita .env y define ADMIN_PASSWORD antes de continuar.
docker compose up -d --build
```

`compose.yaml` construye desde la carpeta actual. Antes de arrancar, copia `.env.example` a `.env` y define tu propia `ADMIN_PASSWORD`. Puedes ajustar también el puerto. `.env` está ignorado por Git.

## Actualizar

En Dockhand, actualiza el compose con el archivo del repositorio, define `ADMIN_PASSWORD` en sus variables si aún no existe y vuelve a construir el stack con la versión actual de `main`. Conserva el nombre del stack y su volumen. Si no toma los cambios, fuerza una construcción sin caché.

En una instalación desde carpeta:

```sh
git pull --ff-only
docker compose up -d --build
```

Para fijar una versión, sustituye `#main` en el contexto Git del compose de Dockhand por `#` seguido del SHA completo del commit elegido.

## Almacenamiento

`/data/settings.json` contiene el equipo público configurado. `/data/weather-locations.json` conserva las ubicaciones de campos confirmadas y `/data/statistics.json` los contadores diarios de visitas. El resto de archivos son instantáneas e índices de grupos. La contraseña se recibe por variable de entorno y no se copia a esos archivos. La caché se puede reconstruir consultando la federación; conserva los tres archivos de configuración y estadísticas para mantener esos datos. Detener el contenedor antes de hacer una copia garantiza una copia coherente. No uses `docker compose down -v` si quieres conservar el volumen.

El equipo es común a todos los navegadores. Borrar los datos de un navegador no altera la selección. Cerrar sesión o reiniciar el contenedor tampoco cambia el equipo.

## Contraseña y acceso al panel

La contraseña solo se define en las variables del stack, nunca en la documentación ni en el repositorio. Para cambiarla u olvidar la anterior, actualiza `ADMIN_PASSWORD` y recrea el contenedor. Todas las sesiones anteriores quedarán invalidadas; el equipo se conserva.

El panel no permite que la primera visita cree un administrador: si falta una contraseña válida en el servidor, permanece deshabilitado. Tras ocho intentos fallidos desde la misma dirección, hay una espera de 15 minutos.

La sesión se guarda en una cookie `HttpOnly`, dura 12 horas y se elimina con **Cerrar sesión**. Si un proxy termina HTTPS, debe conservar el encabezado `Host` original e indicar `X-Forwarded-Proto: https`; así la cookie se marca como `Secure`. También puedes establecer `COOKIE_SECURE=true` cuando uses siempre HTTPS. No lo fuerces para una instalación accesible únicamente por HTTP.

## Estadísticas y proxy inverso

Actualiza el compose del stack para incluir `ANALYTICS_TRUST_PROXY`. Si Cloudflare recibe las visitas y las reenvía a Nginx Proxy Manager u otro proxy local, define en las variables de Dockhand:

```env
ANALYTICS_TRUST_PROXY=cloudflare
```

Este valor confía en los saltos internos de redes privadas y en los rangos publicados de Cloudflare. La dirección original se obtiene recorriendo `X-Forwarded-For` desde el servidor hacia el visitante; `CF-Connecting-IP` solo se utiliza si la cadena contiene un salto de Cloudflare de confianza. El proxy debe conservar `Host` y añadir correctamente la dirección de su conexión a `X-Forwarded-For`. No debe copiar sin validación una cabecera de IP elegida por el visitante. Restringe el acceso directo al puerto de la aplicación cuando deba recibir tráfico solo del proxy.

Para otros proxies, indica sus IP o rangos CIDR separados por comas, por ejemplo `172.20.0.0/24`. Usa exclusivamente la red o las direcciones del proxy real. Si no hay proxy, deja la variable vacía: se ignoran las cabeceras reenviadas. No se activa confianza global en todos los proxies ni se usa esta configuración para autorizar la administración.

Reconstruye y recrea el servicio después de actualizar el compose y las variables. La IP solo se utiliza de forma transitoria para consultar una base local. Las estadísticas no guardan la IP ni la envían a proveedores. Los registros propios de Cloudflare y del proxy son independientes; revisa su configuración si quieres limitar también esos registros.

La base incluida corresponde a la versión de datos instalada, no se descarga en cada visita. Para sustituirla por una edición posterior, descarga una base **DB-IP City Lite MMDB** de su fuente oficial, móntala como archivo de solo lectura y define `GEOIP_DATABASE` con la ruta dentro del contenedor. El lector admite los campos de DB-IP `country_code`, `state1` y `city`. Conserva la atribución de DB-IP y la licencia CC BY 4.0. Si no hay datos para una IP o falla la base, la visita se cuenta con ubicación «No disponible».

## Diagnóstico

```sh
docker compose ps
docker compose logs --tail=100 futboleros
```

- **No se puede construir:** comprueba la conexión con GitHub, Docker Hub y `registry.npmjs.org`, además del espacio disponible.
- **Puerto ocupado:** cambia `APP_PORT` y recrea el servicio.
- **La aplicación abre, pero no carga el equipo:** comprueba la conexión del contenedor con `https://www.rffm.es`, el enlace de la ficha y el aviso que muestra la aplicación. Reintenta después de que se recupere el origen.
- **Salen datos anteriores:** consulta la fecha indicada. Un fallo del origen conserva la última copia con aviso; la caché normal dura 15 minutos.
- **No aparece la previsión:** comprueba HTTPS hacia `api.open-meteo.com` y `nominatim.openstreetmap.org`. Si falta confirmar el campo, entra en Administración → Ubicación para la previsión y guarda la alternativa correcta o sus coordenadas. Las fechas fuera de los próximos 16 días todavía no tienen pronóstico. No se necesitan claves de API.
- **Aún no hay calendario o clasificación:** puede que la federación no haya asignado grupo o publicado la competición para la temporada actual.
- **El panel no está habilitado:** comprueba que `ADMIN_PASSWORD` llega al contenedor y tiene al menos 12 caracteres. Tras cambiar variables hay que recrear el servicio.
- **El equipo no se guarda:** revisa los permisos del volumen y el mensaje del panel. Un error de escritura no se presenta como guardado correcto.
- **No encuentra un nombre:** busca el nombre del club sin el sufijo del equipo o pega el enlace de la ficha. El buscador muestra la categoría para distinguir equipos con nombres iguales.

No desactives la verificación TLS para resolver problemas de conexión. Si tu red utiliza un proxy corporativo, configura su certificado de confianza y las variables estándar del proxy en tu entorno de construcción o ejecución.

## Acceso remoto

El compose publica la web en todas las interfaces del servidor. La web pública no requiere sesión y el panel `/admin` está protegido por contraseña. Para compartirla por Internet, configura HTTPS. Si además necesitas restringir quién puede ver el equipo, añade autenticación en el proxy o utiliza una VPN. Si el proxy corre directamente en el mismo servidor, puedes establecer `BIND_ADDRESS=127.0.0.1`. Si el proxy corre en otro contenedor, usa una red Docker compartida y adapta el compose a esa red.
