const EGP_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EGP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatEGP(amount: number): string {
  return EGP_FORMATTER.format(amount);
}

export function formatEGPCompact(amount: number): string {
  return `${amount.toLocaleString('en-US')} ج.م`;
}
