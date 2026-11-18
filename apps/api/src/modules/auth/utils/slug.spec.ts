import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Logistics')).toBe('acme-logistics');
  });

  it('strips accents and punctuation', () => {
    expect(slugify('Église Saint-Étienne & Co.!')).toBe('eglise-saint-etienne-co');
  });

  it('collapses repeated separators and trims the ends', () => {
    expect(slugify('  --Grace   Chapel__Lagos--  ')).toBe('grace-chapel-lagos');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(39) + ' bbbbbbbbbb');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('organization');
    expect(slugify('日本語')).toBe('organization');
  });
});
