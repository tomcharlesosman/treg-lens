import Link from "next/link";

// Treg sub-product lockup: the ▚ mark, then "treg / lens" like treg.to/aeo.
export default function MarketingLogo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`marketing-logo ${light ? "is-light" : ""}`}
      aria-label="Treg Lens home"
    >
      <span className="marketing-brand-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="marketing-logo-word">treg</span>
      <span className="marketing-logo-slash" aria-hidden="true">
        /
      </span>
      <span className="marketing-logo-product">lens</span>
    </Link>
  );
}
