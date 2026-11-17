// Builder Management: option lists shared by the API (validation) and the admin UI.
// Internal-only data — nothing here is ever published on the website.

export const AGREEMENT_STATUS = [
  { value: 'completed', label: 'Agreement Completed', tone: 'ok' },
  { value: 'pending', label: 'Agreement Pending', tone: 'warn' },
  { value: 'not_initiated', label: 'Not Initiated', tone: '' },
  { value: 'expired', label: 'Expired', tone: 'red' },
] as const;

/** Display order on the builder profile: ongoing first, then upcoming, then completed. */
export const PROJECT_STATUS = [
  { value: 'ongoing', label: 'Ongoing', tone: 'ok' },
  { value: 'upcoming', label: 'Upcoming', tone: 'info' },
  { value: 'completed', label: 'Completed', tone: '' },
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUS)[number]['value'];
export type ProjectStatus = (typeof PROJECT_STATUS)[number]['value'];

export const AGREEMENT_MAX_BYTES = 20 * 1024 * 1024;

export const agreementLabel = (v: string) => AGREEMENT_STATUS.find((s) => s.value === v)?.label ?? v;
export const agreementTone = (v: string) => AGREEMENT_STATUS.find((s) => s.value === v)?.tone ?? '';
export const projectLabel = (v: string) => PROJECT_STATUS.find((s) => s.value === v)?.label ?? v;
export const projectTone = (v: string) => PROJECT_STATUS.find((s) => s.value === v)?.tone ?? '';

/** "2026-11-17" → "17 Nov 2026" (dates are plain calendar days, no time zone shift). */
export function fmtDay(d: string | null | undefined) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** True when the expiry date is before today (local calendar day). */
export function isPastDay(d: string | null | undefined) {
  if (!d) return false;
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return d.slice(0, 10) < today;
}
