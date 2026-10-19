type BrandProps = { variant?: "sidebar" | "header" | "mobile" };

export default function Brand({ variant = "header" }: BrandProps) {
  return (
    <a
      className={`brand brand--${variant}`}
      href="/"
      aria-label="Futboleros, inicio"
    >
      <img
        className="brand-logo"
        src="/logo-futboleros.png"
        alt=""
        width="1254"
        height="1254"
        decoding="async"
      />
      <span className="brand-name">
        futboleros<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
