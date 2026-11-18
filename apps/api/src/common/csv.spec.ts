import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('neutralises spreadsheet formulas in typed text', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\t=1']) {
      expect(csvCell(evil).replace(/^"/, '')).toMatch(/^'/);
    }
  });

  it('leaves real negative numbers and ordinary text alone', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('Ada Uzo')).toBe('Ada Uzo');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Boss, Ada')).toBe('"Boss, Ada"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('writes dates as ISO text, a BOM first and CRLF rows', () => {
    const out = toCsv(['name', 'when'], [['Ada', new Date('2026-10-01T10:00:00Z')]]);
    expect(out).toBe('﻿name,when\r\nAda,2026-10-01T10:00:00.000Z\r\n');
  });
});
