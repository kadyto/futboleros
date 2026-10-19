import type { ReactNode } from "react";

export default function FederationLink({
  href,
  children,
  className = "",
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return href ? (
    <a
      className={`federation-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver ficha en la federación (se abre en otra pestaña)"
    >
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}
