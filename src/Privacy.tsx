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
