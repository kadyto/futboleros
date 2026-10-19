# Instalación y mantenimiento

## Stack en Dockhand

Usa [compose.dockhand.yaml](../compose.dockhand.yaml). El contexto de construcción apunta al repositorio público y su rama `main`; Dockhand necesita acceso a GitHub para construirlo. Usa Docker Compose v2 con soporte de contextos Git.

1. Crea un stack llamado `futboleros`.
2. Pega el compose completo.
3. Opcionalmente define `APP_PORT` si quieres cambiar el puerto 8093.
4. Construye y despliega. Cuando termine, el contenedor debe aparecer como saludable.
5. Entra desde el navegador usando el nombre o la dirección de tu servidor y el puerto elegido.

Si Dockhand pide seleccionar una imagen existente, elige el modo de construcción del stack. Este despliegue construye el código del repositorio; no depende de una imagen prepublicada en otro registro.

El volumen gestionado evita depender de rutas del servidor. La imagen crea `/data` con el propietario correcto antes de usar el usuario sin privilegios `node` (UID 1000). No añadas `user: root` ni cambies permisos a `777`.

## Instalación desde una carpeta

```sh
git clone https://github.com/kadyto/futboleros.git
cd futboleros
docker compose up -d --build
```

`compose.yaml` construye desde la carpeta actual. Puedes copiar `.env.example` a `.env` y ajustar el puerto antes de arrancar.

## Actualizar

En Dockhand, vuelve a construir el stack obteniendo la versión actual de `main` y recrea el servicio. Conserva su volumen. Si no toma los cambios, fuerza una construcción sin caché.

En una instalación desde carpeta:

```sh
git pull --ff-only
docker compose up -d --build
```

Para fijar una versión, sustituye `#main` en el contexto Git del compose de Dockhand por `#` seguido del SHA completo del commit elegido.

## Almacenamiento

`/data` contiene instantáneas JSON e índices de grupos; no contiene contraseñas ni configuraciones de otros servicios. La caché se puede reconstruir consultando la federación. Detener el contenedor antes de hacer una copia garantiza una copia coherente. No uses `docker compose down -v` si quieres conservar el volumen.

El equipo elegido se guarda en el almacenamiento local de cada navegador. Borrar los datos del navegador elimina esa selección, sin afectar al resto de usuarios. Cambiar el dominio, protocolo o puerto también crea un almacenamiento de navegador distinto.

## Diagnóstico

```sh
docker compose ps
docker compose logs --tail=100 futboleros
```

- **No se puede construir:** comprueba la conexión con GitHub, Docker Hub y `registry.npmjs.org`, además del espacio disponible.
- **Puerto ocupado:** cambia `APP_PORT` y recrea el servicio.
- **La aplicación abre, pero no carga el equipo:** comprueba la conexión del contenedor con `https://www.rffm.es`, el enlace de la ficha y el aviso que muestra la aplicación. Reintenta después de que se recupere el origen.
- **Salen datos anteriores:** consulta la fecha indicada. Un fallo del origen conserva la última copia con aviso; la caché normal dura 15 minutos.
- **Aún no hay calendario o clasificación:** puede que la federación no haya asignado grupo o publicado la competición para la temporada actual.
- **No encuentra un nombre:** busca el nombre del club sin el sufijo del equipo o pega el enlace de la ficha. El buscador muestra la categoría para distinguir equipos con nombres iguales.

No desactives la verificación TLS para resolver problemas de conexión. Si tu red utiliza un proxy corporativo, configura su certificado de confianza y las variables estándar del proxy en tu entorno de construcción o ejecución.

## Acceso remoto

El compose publica la web en todas las interfaces del servidor y no incorpora un inicio de sesión. Mantén el acceso en una red de confianza. Para publicarla en Internet, configura HTTPS y autenticación en un proxy inverso o entra mediante una VPN. Si el proxy corre directamente en el mismo servidor, puedes establecer `BIND_ADDRESS=127.0.0.1`. Si el proxy corre en otro contenedor, usa una red Docker compartida y adapta el compose a esa red.
