const BASE = import.meta.env.BASE_URL;

type LogoProps = {
  mark?: boolean;
  height?: number;
  className?: string;
};

export function Logo({ mark = false, height = 32, className }: LogoProps) {
  // mark uses the circular emblem; wordmark uses the horizontal gold lockup
  const src = mark
    ? `${BASE}tito-icon-512.png`
    : `${BASE}brand/tito-logo-horizontal-gold-on-dark-1200.png`;

  const width = mark ? height : Math.round(height * 3.1);

  return (
    <img
      src={src}
      alt="tito"
      height={height}
      width={width}
      className={className}
      decoding="async"
      style={{ height, width: 'auto', maxWidth: mark ? height : height * 3.4, objectFit: 'contain' }}
    />
  );
}
