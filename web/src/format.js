export function fullName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed customer';
}

export function initials(c) {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  const src = parts.length ? parts : [c.email ?? '?'];
  return src.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function money(amount, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0); }
  catch { return `${(amount ?? 0).toFixed(2)} ${currency}`; }
}

export function shortDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** 'overdue' | 'due-soon' | 'later' | null for an open task's YYYY-MM-DD due date. */
export function dueState(dueDate, today = new Date()) {
  if (!dueDate) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((Date.parse(dueDate) - t) / 86_400_000);
  if (days < 0) return 'overdue';
  return days <= 3 ? 'due-soon' : 'later';
}

export function orderLabel(count) {
  return count === 1 ? '1 order' : `${count} orders`;
}
