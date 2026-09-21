const BASE = import.meta.env.BASE_URL;

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={`${BASE}brand/tito-logo-horizontal-gold-on-dark-1200.png`}
      alt="tito"
      className={className}
      height={30}
      width={120}
    />
  );
}
