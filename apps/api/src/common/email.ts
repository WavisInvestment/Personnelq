/** Emails are compared and stored in lower case, so "Eve@x.com" and "eve@x.com" are one person. */
export const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
