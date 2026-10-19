# Futboleros

Tu equipo, su calendario y toda la temporada en una web sencilla, sin anuncios ni cuentas. Pensada para consultar desde el móvil y alojarla en tu propio servidor con Docker.

## Qué puedes hacer

- Elegir un equipo de la Federación de Fútbol de Madrid buscando su club, pegando el enlace de su ficha o introduciendo su identificador.
- Ver en la portada el próximo encuentro, el último resultado y la posición en la liga.
- Consultar el calendario completo, los resultados, la clasificación y la plantilla pública.
- Exportar los partidos pendientes a un archivo de calendario `.ics`.
- Recordar el equipo elegido y hasta ocho equipos recientes en cada navegador.
- Cambiar de equipo cuando cambie la categoría o empiece otra temporada.
- Explorar una demostración identificada con datos ficticios.

La aplicación consulta los datos públicos de la RFFM. No está afiliada a la federación. La información depende de lo que esta publique y los horarios pueden cambiar. Las fichas sin grupo asignado, las plantillas no publicadas y las horas pendientes se muestran como tales; no se inventan datos ni se sustituye un fallo por la demostración.

## Instalar en Dockhand

Crea un stack y pega el contenido de [compose.dockhand.yaml](compose.dockhand.yaml). Construye y despliega el stack. No necesitas clonar el repositorio, elegir rutas de almacenamiento ni crear usuarios de la aplicación.

El compose descarga el código de `main`, construye la web y publica el puerto **8093** del servidor. Abre la dirección de tu servidor con ese puerto. Si ya lo usas para otro servicio, cambia `8093` por un puerto libre o define `APP_PORT` en Dockhand.

El volumen `futboleros_data` se crea automáticamente y conserva la caché entre recreaciones del contenedor. No lo borres para actualizar. La selección de equipo se conserva en el navegador: cada móvil puede seguir un equipo distinto.

La imagen se construye con Node 24 sobre Alpine, con variantes para amd64 y arm64. La primera construcción necesita acceso a Docker Hub, GitHub y el registro de npm. En ejecución necesita HTTPS a `www.rffm.es`.

Para más detalles, consulta [la guía de instalación y mantenimiento](docs/despliegue.md).

## Primer uso

1. Busca el nombre del club y elige el equipo con su categoría. Si el nombre es muy genérico, concreta la búsqueda.
2. También puedes abrir la ficha del equipo en `rffm.es`, copiar su dirección y pegarla en el selector. Solo se aceptan fichas HTTPS de ese dominio.
3. La primera consulta localiza el grupo del equipo y puede tardar unos segundos. Las siguientes usan la caché.
4. Usa **Calendario**, **Clasificación** y **Plantilla** para ver las demás pantallas. En móvil, están en la barra inferior.
5. Al cambiar de temporada o categoría, abre el selector y elige la nueva ficha. La aplicación consulta la temporada actual publicada; no deduce ascensos ni cambios de plantilla por edad.

Puedes añadir la web a la pantalla de inicio desde el navegador. El manifiesto facilita su uso como web independiente; esta versión no genera un APK. El frontend y la API están separados para facilitar un futuro cliente móvil.

La exportación `.ics` es una copia de los partidos publicados: importarla no suscribe a cambios. Las fechas sin hora se exportan como eventos de día completo con aviso de hora pendiente. Los partidos sin fecha, ya jugados o aplazados no se exportan.

## Datos y privacidad

La caché dura 15 minutos y se guarda en `/data`. **Actualizar** vuelve a consultar la API de la aplicación respetando ese intervalo para no saturar el origen. Si la federación falla y hay una copia anterior, se muestra con un aviso y su fecha de consulta; si no hay copia, se muestra el error y se permite reintentar.

El índice de grupos se conserva durante 24 horas por temporada y categoría. Las consultas al origen se limitan a cuatro simultáneas y se comparten cuando varios usuarios piden el mismo equipo. Solo se consulta la categoría necesaria, no se descarga toda la federación.

La plantilla incluye únicamente los nombres deportivos publicados. Se descartan fotografías, fechas de nacimiento, identificadores de jugadores, direcciones, teléfonos y correos que puedan aparecer en la respuesta de origen. No hay analítica, publicidad, fuentes remotas ni servicios externos en el navegador. La elección del equipo se guarda localmente en ese navegador.

La aplicación no incluye autenticación. Está orientada a una red de confianza; para acceso desde Internet usa un proxy HTTPS con autenticación o una VPN. El contenedor no necesita acceso al socket de Docker.

## Desarrollo

Requisitos: Node **24.15 o posterior**, npm y acceso HTTPS a la federación.

```sh
npm ci
npm run build
npm start
```

El servidor escucha en el puerto 8000. Para desarrollar con recarga de la interfaz, ejecuta `npm run dev` y, en otra terminal, `npm run dev:web`; Vite redirige `/api` al backend.

```sh
npm test
npm run check
npm run build
```

Las pruebas cubren extracción de datos, descubrimiento del grupo, caché persistente, fallos del origen, exportación y API HTTP. Las pruebas del navegador usan datos ficticios y no dependen de que la federación esté disponible:

```sh
npm install --prefix /tmp/futboleros-browser --no-audit --no-fund playwright-core
PLAYWRIGHT_MODULE=/tmp/futboleros-browser/node_modules/playwright-core \
CHROMIUM_PATH=/ruta/a/chromium node tests/browser.cjs
```

Las capturas de esas pruebas se guardan en `test-results/`, que Git ignora. La integración con RFFM está aislada en `server/provider.mjs` para poder adaptar sus cambios de formato sin rehacer la interfaz.

## Variables

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `APP_PORT` | `8093` | Puerto del servidor publicado por Compose. |
| `BIND_ADDRESS` | `0.0.0.0` | Interfaz publicada por Compose. |
| `PORT` | `8000` | Puerto del backend al ejecutar Node directamente. |
| `HOST` | `0.0.0.0` | Interfaz del backend al ejecutar Node directamente. |
| `DATA_DIR` | `./data` fuera de Docker, `/data` dentro | Caché e índice de grupos. |
| `TZ` | `Europe/Madrid` en Docker | Zona horaria del contenedor; los partidos usan la hora de Madrid. |

No se necesitan claves de API ni credenciales de la federación. `/healthz` comprueba que el servidor responde, no la disponibilidad de la web externa.
