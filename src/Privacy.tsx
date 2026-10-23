import { ArrowLeft } from "lucide-react";
import Brand from "./Brand";

export default function Privacy() {
  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <Brand />
        <a className="secondary" href="/">
          <ArrowLeft size={15} />
          Volver al equipo
        </a>
      </header>
      <main className="admin-main privacy-content">
        <h1>
          Privacidad<span>.</span>
        </h1>
        <section className="panel">
          <h2>Estadísticas de la web</h2>
          <p>
            Esta instalación cuenta las entradas y las pantallas consultadas
            para conocer el uso de la web. Conserva únicamente contadores
            diarios separados por pantalla, tipo de dispositivo, sistema
            operativo, modelo comunicado por el navegador y ubicación
            aproximada. Las estadísticas no identifican personas únicas ni
            permiten consultar un historial individual.
          </p>
          <p>
            La IP se utiliza de forma transitoria en el servidor para estimar la
            ciudad o el país con una base de datos local. No se guarda la IP ni
            un hash suyo en las estadísticas, y no se envía a un servicio de
            geolocalización externo. La ubicación puede ser incorrecta y no
            utiliza GPS. Tampoco se conserva el encabezado completo del
            navegador, la URL de procedencia ni parámetros de navegación.
          </p>
          <p>
            No se instalan cookies de analítica, identificadores en el
            almacenamiento del navegador ni huellas digitales. El modelo solo se
            obtiene cuando aparece en el encabezado normal del navegador; no se
            solicitan datos adicionales del dispositivo. Se respetan las señales
            DNT y Global Privacy Control. Las sesiones de administración y los
            robots reconocidos no se cuentan.
          </p>
          <p>
            Los contadores se limitan a los últimos 90 días y solo pueden
            consultarse desde la administración. El navegador no carga analítica
            de terceros. Los registros del proxy o del proveedor que publique
            esta instalación dependen de su configuración y son independientes
            de estos contadores.
          </p>
          <p>
            La estimación utiliza{" "}
            <a
              href="https://db-ip.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              IP Geolocation by DB-IP
            </a>
            , con datos locales bajo{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY 4.0
            </a>
            .
          </p>
          <h2>Avisos de cambios en partidos</h2>
          <p>
            Las notificaciones son opcionales y se activan en cada dispositivo
            mediante el permiso del navegador. Para enviarlas, el servidor
            conserva la dirección de suscripción del servicio push del navegador
            y sus claves de cifrado. No se usan para identificar visitas ni se
            mezclan con las estadísticas. Puedes desactivarlas desde la campana
            de avisos y retirar el permiso desde los ajustes del navegador.
          </p>
          <p>
            Para reconocer las suscripciones en el panel privado, se guardan el
            tipo de dispositivo, sistema, navegador y modelo cuando aparece en
            su encabezado normal, junto con las fechas de alta y última
            sincronización. No se conserva el encabezado completo ni se
            solicitan datos adicionales. La administración puede consultar esta
            lista y dar de baja un dispositivo; la web pública no muestra sus
            detalles. Abrir la web tras una baja no reactiva los avisos: debes
            activarlos expresamente desde la campana.
          </p>
          <p>
            Los mensajes se cifran y se entregan a través del servicio push del
            navegador, que puede estar gestionado por Google, Mozilla, Apple o
            Microsoft. El servidor elimina las suscripciones que estos servicios
            indican como caducadas. No se guarda la IP con la suscripción.
          </p>
          <p>
            El historial de cambios del calendario se conserva durante un máximo
            de 90 días y los envíos pendientes se reintentan durante un máximo
            de 24 horas. El navegador puede guardar la fecha del último aviso
            leído para mostrar el contador de avisos nuevos; este ajuste
            funcional no identifica al visitante en el servidor.
          </p>
          <h2>Información deportiva y administración</h2>
          <p>
            La información deportiva procede de las fichas públicas de la
            federación. La aplicación no pide la ubicación del visitante para
            mostrar el tiempo del partido. Las consultas meteorológicas utilizan
            la ubicación del campo.
          </p>
          <p>
            El panel privado utiliza una cookie técnica de sesión, necesaria
            para iniciar sesión y proteger la configuración. Caduca a las 12
            horas y se elimina al cerrar sesión. La web pública se puede
            consultar sin iniciar sesión.
          </p>
          <p>
            El administrador de esta instalación gestiona su configuración y el
            acceso a las estadísticas. Para consultas sobre esta web, contacta
            con quien te haya facilitado su dirección.
          </p>
        </section>
      </main>
    </div>
  );
}
