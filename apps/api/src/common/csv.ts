/**
 * Builds a CSV that is safe to open in a spreadsheet. Values that start with = + - @ (or a tab/CR) would be run
 * as formulas by Excel/Sheets, so they get a leading apostrophe; names and job titles are user-typed.
 * Starts with a BOM so Excel reads accents (UTF-8) correctly.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Numbers such as -5 are data, not formulas.
  if (typeof value !== 'number' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
