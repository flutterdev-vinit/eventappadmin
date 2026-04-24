/** Display amounts in admin UI (stored values are GBP major units). */
export function formatGbp(amount: number | null | undefined): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}
