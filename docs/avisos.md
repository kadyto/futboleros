# Avisos de cambios en partidos

## Comprobación automática

El proceso principal del servidor revisa el calendario del equipo publicado cada 24 horas, aunque no haya visitantes ni navegadores abiertos. El contenedor debe permanecer encendido y tener conexión HTTPS con la federación. No hace falta instalar cron ni otro contenedor.

La primera revisión establece una referencia y no anuncia todos los partidos como novedades. Al cambiar de equipo o de temporada se crea una nueva referencia sin anuncios automáticos antiguos. Los avisos manuales del mismo equipo se conservan al actualizar la referencia de temporada. Al cambiar de equipo se limpia su historial y se dejan de enviar sus avisos pendientes. Las suscripciones siguen a la web y al equipo que publique su administración.

Se comparan fecha, hora, campo, jornada, equipos y aplazamientos o reanudaciones de partidos pendientes; también se avisa de nuevos partidos publicados. Los resultados de partidos jugados no se consideran cambios de calendario. Los cambios se guardan en la campana con el valor anterior y el nuevo. Se conservan como máximo 100 avisos de los últimos 90 días.

Una revisión fuerza una consulta actualizada del calendario; no se limita a leer una copia reciente de la caché. El servidor comprueba aproximadamente cada minuto si ha llegado la siguiente revisión. Si estuvo apagado y la revisión venció, lo comprueba al arrancar.

Si falla el origen, devuelve datos antiguos o un calendario inesperadamente vacío, se conserva la referencia válida y se reintenta a los 15 minutos. Un partido que desaparezca temporalmente no se interpreta como cancelado; se mantiene la referencia mientras siga siendo futuro, para detectar cambios cuando reaparezca. Solo se anuncia un aplazamiento cuando el origen lo indica.

En Administración → Configuración → **Avisos de cambios en partidos** se muestran la última revisión correcta, la próxima, los dispositivos suscritos y las entregas pendientes. **Comprobar calendario ahora** permite adelantar una revisión sin esperar al siguiente día.

La sección **Dispositivos que reciben avisos** muestra una tarjeta por suscripción: tipo de dispositivo, sistema, navegador y modelo cuando el encabezado normal lo comunica, referencia abreviada, fecha de alta y última sincronización. Esta última fecha refleja la apertura de la web o la activación de los avisos, no la conexión actual ni la entrega de una notificación. No identifica al propietario. **Actualizar lista** consulta el estado sin revisar de nuevo el calendario.

**Dar de baja** pide confirmar y elimina la suscripción del servidor. Volver a abrir la página no la reactiva automáticamente; el visitante puede volver a activarla expresamente desde la campana. Las suscripciones anteriores siguen funcionando: sus detalles aparecerán cuando vuelvan a abrir la web. Solo la administración puede ver esta lista, que no incluye direcciones push ni claves.

## Envío manual

En Administración → Configuración → Avisos de cambios en partidos → **Enviar una notificación**:

1. Escribe un título de hasta 80 caracteres y un mensaje de hasta 500. Puedes incluir un resultado aunque la federación todavía no lo haya publicado.
2. Pulsa **Ver vista previa** y revisa el contenido y el número de dispositivos suscritos. **Volver a editar** permite corregirlo antes del envío.
3. Pulsa **Confirmar y enviar aviso**. El mensaje se publica en la campana y se prepara el envío a los dispositivos suscritos en ese momento. Si no hay ninguno, sigue apareciendo en la campana.

Al pulsar el aviso se abre la sección **Resultados** del calendario. **Últimos avisos manuales** muestra los cinco anuncios más recientes en administración. El historial conjunto de la campana se limita a 100 avisos de los últimos 90 días.

El envío manual no consulta la federación, no espera a la siguiente revisión diaria ni cambia su fecha. La aplicación conserva el contenido y los destinatarios antes de enviar y utiliza la misma cola persistente, reintentos y plazo de 24 horas que los avisos automáticos. Los dispositivos que se suscriban después no reciben anuncios anteriores. Una baja impide nuevos intentos a ese dispositivo; una entrega que ya haya aceptado el proveedor puede seguir llegando.

Si falla la conexión del panel tras confirmar, se puede reintentar el mismo envío: mientras el aviso siga en el historial, su identificador impide crear otra publicación o volver a enviar a quienes ya lo recibieron. Crear otro formulario y confirmarlo publica un aviso nuevo. La confirmación indica que el envío se ha programado; no acredita que una persona lo haya visto. Los permisos del sistema y las restricciones del navegador siguen condicionando la entrega.

El texto se envía como texto plano, el enlace permanece dentro de esta web y solo una sesión de administración puede publicar. Un anuncio manual no modifica los resultados de la federación ni los marcadores mostrados en el calendario.

## Activar en cada dispositivo

1. Abre la web pública mediante HTTPS y pulsa la campana de la cabecera.
2. Pulsa **Activar avisos en este dispositivo** y concede el permiso del navegador. No se pide ese permiso al entrar en la web.
3. Usa **Probar aviso** para comprobar la entrega real en ese dispositivo.

La campana muestra el historial aunque el dispositivo no admita notificaciones o no se conceda permiso. No hace falta iniciar sesión para suscribirse. Cada navegador o dispositivo debe activarlas por separado. **Desactivar avisos** elimina esa suscripción del servidor y del navegador; también se puede retirar el permiso desde los ajustes del navegador.

En iPhone y iPad se requiere iOS o iPadOS 16.4 o posterior: añade la web a la pantalla de inicio desde Compartir y ábrela desde su icono antes de activar los avisos. En Android y ordenador se necesita un navegador compatible con Web Push. La entrega con la página cerrada depende también de que el navegador y el sistema permitan las notificaciones y el funcionamiento en segundo plano. Si el dispositivo está desconectado, el proveedor puede retener temporalmente el envío; la aplicación no puede garantizar una entrega instantánea.

Al tocar una notificación se abre el calendario de esta misma web. El service worker `/sw.js` se utiliza para recibir los avisos, no para cachear páginas ni respuestas de la API.

## Envío y persistencia

No se necesitan cuentas de servicios, claves de API, puertos adicionales ni un servidor de correo. Las claves VAPID se generan automáticamente al activar los avisos por primera vez y se conservan en `/data/push-keys.json`. El valor opcional `PUSH_SUBJECT` permite indicar una URL HTTPS o URI `mailto:` de contacto para identificar al operador ante los proveedores push. El valor predeterminado es la URL pública del proyecto.

El volumen conserva:

- `calendar-watch.json`: referencia del calendario, historial, próxima revisión y envíos pendientes.
- `push-keys.json`: claves VAPID públicas y privadas.
- `push-subscriptions.json`: direcciones de suscripción, claves de cifrado, descripción del navegador y fechas de alta y última sincronización de los dispositivos.

Los archivos se escriben de forma atómica con permisos privados. Conserva los tres al actualizar o restaurar una copia; cambiar o perder las claves VAPID puede obligar a activar de nuevo las suscripciones. No compartas los archivos de claves y suscripciones.

Se envía un resumen por revisión a cada dispositivo suscrito, incluso si cambiaron varios partidos. Las entregas quedan guardadas antes de enviarse y se reintentan cada cinco minutos durante un máximo de 24 horas. Las suscripciones que el proveedor declara caducadas se eliminan. Un reinicio no reinicia la referencia ni pierde la cola pendiente. En caso de interrupción justo después de aceptar un envío, puede repetirse el intento; el identificador de la notificación permite al navegador reemplazar el mismo aviso. No se garantiza entrega exactamente una vez.

Los mensajes se cifran mediante Web Push y usan los servicios del navegador: normalmente Google, Mozilla, Apple o Microsoft. El contenedor necesita HTTPS saliente a los destinos de suscripción de esos proveedores. No se aceptan direcciones arbitrarias ni destinos privados como suscripciones. La página de privacidad describe este tratamiento funcional, independiente de la analítica.

## HTTPS y proxy

La instalación habitual detrás de un proxy inverso y Cloudflare sirve para las notificaciones. Mantén el dominio HTTPS y el encabezado `Host` original. Evita cachear `/api/` y `/sw.js`, y permite al navegador registrar el service worker desde el mismo origen. No se necesitan cambios de confianza de IP adicionales para activar los avisos; `ANALYTICS_TRUST_PROXY` sigue afectando solo a las estadísticas.

Si no llega una prueba, revisa el permiso de notificaciones del sitio, los ajustes del sistema, el modo de ahorro de batería y la conectividad HTTPS saliente del contenedor. Los errores de revisión o entregas pendientes aparecen en Administración. La comprobación del calendario y el historial siguen funcionando si se bloquea el envío push.
