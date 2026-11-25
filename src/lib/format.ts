export function formatCurrency(amount: number, currency = "PKR"): string {
  const raw = Number.isFinite(amount) ? amount : 0;
  const safe = Math.abs(raw) < 0.005 ? 0 : raw;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  const prefix = safe < 0 ? "-" : "";
  return `${prefix}${currency} ${formatted}`;
}

export function formatSignedCurrency(amount: number, currency = "PKR"): string {
  const raw = Number.isFinite(amount) ? amount : 0;
  const safe = Math.abs(raw) < 0.005 ? 0 : raw;
  if (safe === 0) return `${currency} 0`;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe > 0 ? "+" : "-"}${currency} ${formatted}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
