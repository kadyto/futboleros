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

`/data/settings.json` contiene el equipo público configurado. `/data/weather-locations.json` conserva las ubicaciones de campos confirmadas. El resto de archivos son instantáneas e índices de grupos. La contraseña se recibe por variable de entorno y no se copia a esos archivos. La caché se puede reconstruir consultando la federación; conserva `settings.json` y `weather-locations.json` para mantener el equipo y las ubicaciones confirmadas. Detener el contenedor antes de hacer una copia garantiza una copia coherente. No uses `docker compose down -v` si quieres conservar el volumen.

El equipo es común a todos los navegadores. Borrar los datos de un navegador no altera la selección. Cerrar sesión o reiniciar el contenedor tampoco cambia el equipo.

## Contraseña y acceso al panel

La contraseña solo se define en las variables del stack, nunca en la documentación ni en el repositorio. Para cambiarla u olvidar la anterior, actualiza `ADMIN_PASSWORD` y recrea el contenedor. Todas las sesiones anteriores quedarán invalidadas; el equipo se conserva.

El panel no permite que la primera visita cree un administrador: si falta una contraseña válida en el servidor, permanece deshabilitado. Tras ocho intentos fallidos desde la misma dirección, hay una espera de 15 minutos.

La sesión se guarda en una cookie `HttpOnly`, dura 12 horas y se elimina con **Cerrar sesión**. Si un proxy termina HTTPS, debe conservar el encabezado `Host` original e indicar `X-Forwarded-Proto: https`; así la cookie se marca como `Secure`. También puedes establecer `COOKIE_SECURE=true` cuando uses siempre HTTPS. No lo fuerces para una instalación accesible únicamente por HTTP.

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
