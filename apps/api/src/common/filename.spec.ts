import { downloadName, fileNamePart } from './filename';

describe('download file names', () => {
  it('start with the person’s name, in a form that is safe in a header', () => {
    expect(downloadName('Ada Uzo', 'personality-report', 'pdf', new Date('2026-10-01T10:00:00Z'))).toBe('Ada-Uzo-personality-report-2026-10-01.pdf');
    expect(fileNamePart('Chinényé “Ngozi” O’Brien')).toBe('Chinenye-Ngozi-O-Brien');
  });

  it('falls back when a name has nothing usable, and never gets very long', () => {
    expect(fileNamePart('???')).toBe('account');
    expect(fileNamePart('x'.repeat(200)).length).toBe(60);
  });
});
