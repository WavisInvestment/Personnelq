/**
 * Download file names start with the name of the person the record is about: the account holder for their own
 * downloads, the staff member for a company downloading one person's record. Header-safe: ASCII letters and digits
 * joined by dashes, so accents, spaces and quotes never reach Content-Disposition.
 */
export function fileNamePart(name: string, fallback = 'account'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** `Ada-Uzo-personality-report-2026-10-22.pdf` */
export function downloadName(personName: string, label: string, ext: string, date: Date = new Date()): string {
  return `${fileNamePart(personName)}-${label}-${date.toISOString().slice(0, 10)}.${ext}`;
}
