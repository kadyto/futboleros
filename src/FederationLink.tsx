import type { ReactNode } from "react";

export default function FederationLink({
  href,
  children,
  className = "",
  title = "Ver ficha en la federación (se abre en otra pestaña)",
  ariaLabel,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return href ? (
    <a
      className={`federation-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}
