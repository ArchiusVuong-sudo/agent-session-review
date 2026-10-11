export function formatQty(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}
