# Futboleros

Tu equipo, su calendario y toda la temporada en una web sencilla, sin anuncios, con una vista pública de solo lectura y un pequeño panel privado. Pensada para consultar desde el móvil y alojarla en tu propio servidor con Docker.

## Qué puedes hacer

- Configurar un equipo de la Federación de Fútbol de Madrid desde un panel protegido con contraseña, buscando el club o pegando su ficha.
- Ver en la portada el próximo encuentro, el último resultado y la posición en la liga.
- Consultar el calendario completo, los resultados, la clasificación y la plantilla pública.
- Ver la posición actual junto a cada equipo en los partidos y una estimación orientativa de victoria local, empate y victoria visitante en el próximo encuentro.
- Exportar los partidos pendientes a un archivo de calendario `.ics`.
- Compartir el enlace público: todos ven el equipo configurado y nadie puede cambiarlo sin iniciar sesión.
- Conservar la selección en el servidor y cambiarla desde el panel cuando empiece otra temporada o cambie la categoría.

La aplicación consulta los datos públicos de la RFFM. No está afiliada a la federación. La información depende de lo que esta publique y los horarios pueden cambiar. Las fichas sin grupo asignado, las plantillas no publicadas y las horas pendientes se muestran como tales; no se inventan datos ni se sustituye un fallo por la demostración.

## Posiciones y estimación del próximo partido

Las posiciones junto a los equipos corresponden a la clasificación actual de su grupo, también cuando consultas resultados antiguos. Si no se puede identificar con seguridad al equipo en la tabla, se muestra «Sin posición». Se utiliza primero el identificador federativo y solo se recurre al nombre cuando no hay identificadores contradictorios ni nombres ambiguos.

La portada estima los tres posibles resultados con los datos de ambos equipos: posición, puntos por partido y goles marcados y recibidos por partido. Las tasas goleadoras se suavizan con la media de la liga y tres partidos de referencia. Una corrección moderada por posición y puntos por partido, que pesa menos con pocos encuentros, ajusta los goles esperados. Un modelo de Poisson convierte esos goles esperados en porcentajes de victoria local, empate y victoria visitante. No se aplica una ventaja de campo fija al no disponer de estadísticas separadas de local y visitante.

Se necesitan al menos tres partidos de cada equipo, posiciones disponibles y estadísticas completas. Con tres o cuatro encuentros se avisa de mayor incertidumbre. Sin datos suficientes, o si el encuentro está aplazado, no se inventan porcentajes. Los valores se redondean a enteros repartiendo el redondeo para sumar 100; los extremos se muestran como «<1 %» o «>99 %» para evitar presentar certezas. Se limitan las tasas extremas a entre 0,15 y 15 goles esperados por equipo. La explicación está disponible en «Cómo se calcula».

Es una aproximación estadística sin calibración ni validación histórica para estas competiciones; no garantiza resultados y no considera bajas, alineaciones ni cambios de plantilla. Si se está mostrando la última copia guardada, la estimación utiliza esa misma clasificación y se indica en la explicación. No requiere servicios ni claves externos.

## Instalar en Dockhand

Crea un stack y pega el contenido de [compose.dockhand.yaml](compose.dockhand.yaml). Define `ADMIN_PASSWORD` en las variables del stack con una contraseña propia de al menos 12 caracteres. Construye y despliega el stack. No necesitas clonar el repositorio ni elegir rutas de almacenamiento.

El compose descarga el código de `main`, construye la web y publica el puerto **8093** del servidor. Abre la dirección de tu servidor con ese puerto. Si ya lo usas para otro servicio, cambia `8093` por un puerto libre o define `APP_PORT` en Dockhand.

El volumen `futboleros_data` se crea automáticamente y conserva la selección del equipo y la caché entre recreaciones del contenedor. Mantén el nombre del stack y su volumen al actualizar. Todos los navegadores muestran el mismo equipo.

La imagen se construye con Node 24 sobre Alpine, con variantes para amd64 y arm64. La primera construcción necesita acceso a Docker Hub, GitHub y el registro de npm. En ejecución necesita HTTPS a `www.rffm.es`.

Para más detalles, consulta [la guía de instalación y mantenimiento](docs/despliegue.md).

## Primer uso

1. Abre `/admin` en la misma dirección donde has instalado la web e inicia sesión con `ADMIN_PASSWORD`.
2. Busca el club y selecciona el equipo con su categoría. También puedes pegar su ficha HTTPS de `rffm.es` o su identificador.
3. Revisa el nombre y la categoría y pulsa **Guardar equipo público**. Revisar un equipo no cambia la selección publicada.
4. Comparte la dirección principal de la web, sin `/admin`. Los visitantes pueden ver calendario, resultados, clasificación y plantilla, además de exportar el calendario, sin iniciar sesión.
5. Al cambiar de categoría, entra de nuevo en `/admin` y guarda la nueva ficha. La aplicación consulta la temporada actual publicada; no deduce cambios de plantilla o categoría por edad.

Si actualizas desde la versión 0.1, el equipo antes elegido en un navegador no se publica automáticamente. Configúralo una vez desde el nuevo panel; las preferencias antiguas del navegador dejan de determinar qué equipo se muestra.

El servidor comprueba los permisos también en la API: buscar y configurar equipos requiere sesión. Las consultas públicas solo permiten acceder al equipo guardado. Cambiar una dirección o modificar el almacenamiento del navegador no permite cambiar el equipo público.

Puedes añadir la web a la pantalla de inicio desde el navegador. El manifiesto facilita su uso como web independiente; esta versión no genera un APK. El frontend y la API están separados para facilitar un futuro cliente móvil.

La exportación `.ics` es una copia de los partidos publicados: importarla no suscribe a cambios. Las fechas sin hora se exportan como eventos de día completo con aviso de hora pendiente. Los partidos sin fecha, ya jugados o aplazados no se exportan.

## Datos y privacidad

La caché dura 15 minutos y se guarda en `/data`. **Actualizar** vuelve a consultar la API de la aplicación respetando ese intervalo para no saturar el origen. Si la federación falla y hay una copia anterior, se muestra con un aviso y su fecha de consulta; si no hay copia, se muestra el error y se permite reintentar.

El índice de grupos se conserva durante 24 horas por temporada y categoría. Las consultas al origen se limitan a cuatro simultáneas y se comparten cuando varios usuarios piden el mismo equipo. Solo se consulta la categoría necesaria, no se descarga toda la federación.

La plantilla incluye únicamente los nombres deportivos publicados. Se descartan fotografías, fechas de nacimiento, identificadores de jugadores, direcciones, teléfonos y correos que puedan aparecer en la respuesta de origen. No hay analítica, publicidad, fuentes remotas ni servicios externos en el navegador. La elección del equipo se guarda en `/data/settings.json`; no depende del almacenamiento del navegador.

La administración usa una contraseña definida en el servidor y sesiones con cookies `HttpOnly` y `SameSite=Strict`. Las sesiones duran 12 horas, se invalidan al cerrar sesión y no sobreviven a un reinicio del servidor. Los intentos fallidos están limitados. Sin una contraseña válida, el panel queda deshabilitado; una configuración pública ya guardada continúa disponible.

Para compartirla por Internet, usa HTTPS, también al acceder al panel. La parte pública es accesible sin contraseña; si quieres limitar quién puede ver la información, añade autenticación en un proxy inverso o utiliza una VPN. El contenedor no necesita acceso al socket de Docker.

## Desarrollo

Requisitos: Node **24.15 o posterior**, npm y acceso HTTPS a la federación.

```sh
npm ci
npm run build
npm start
```

El servidor escucha en el puerto 8000. Define `ADMIN_PASSWORD` en el entorno del proceso para usar el panel; no guardes la contraseña en el código. Las pruebas proporcionan su propia contraseña ficticia. Para desarrollar con recarga de la interfaz, ejecuta `npm run dev` y, en otra terminal, `npm run dev:web`; Vite redirige `/api` al backend.

```sh
npm test
npm run check
npm run build
```

Las pruebas cubren extracción de datos, descubrimiento del grupo, caché, fallos del origen, exportación, sesión de administración, permisos de la API, protección de cambios y persistencia de la selección. Las pruebas del navegador usan datos ficticios y no dependen de que la federación esté disponible:

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
| `DATA_DIR` | `./data` fuera de Docker, `/data` dentro | Configuración del equipo, caché e índice de grupos. |
| `ADMIN_PASSWORD` | Sin valor predeterminado | Contraseña privada del panel: al menos 12 caracteres. Obligatoria en Compose. |
| `COOKIE_SECURE` | `auto` | Activa `Secure` si la petición llega por HTTPS o el proxy indica `X-Forwarded-Proto: https`. `true` lo fuerza. |
| `TZ` | `Europe/Madrid` en Docker | Zona horaria del contenedor; los partidos usan la hora de Madrid. |

No se necesitan claves de API ni credenciales de la federación. `/healthz` comprueba que el servidor responde, no la disponibilidad de la web externa.
