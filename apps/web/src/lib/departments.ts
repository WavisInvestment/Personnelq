/**
 * The departments people can be placed in. The list lives here, in the website: the server just stores the value
 * that is chosen. Different kinds of organisation get a list that suits them (a school has classes, a church has
 * groups). "Other" is last on every list.
 */
const LISTS: Record<string, string[]> = {
  corporate: [
    'Administration',
    'Customer Support',
    'Engineering',
    'Executive and Management',
    'Finance',
    'Human Resources',
    'IT',
    'Legal and Compliance',
    'Logistics',
    'Marketing',
    'Operations',
    'Procurement',
    'Product',
    'Quality Assurance',
    'Research and Development',
    'Sales',
    'Security',
    'Other',
  ],
  professional: ['Administration', 'Client Services', 'Finance', 'Logistics', 'Management', 'Marketing', 'Operations', 'Practitioners', 'Support', 'Other'],
  school: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary', 'Teaching Staff', 'Administration', 'Support Staff', 'Management', 'Other'],
  church: [
    'Leadership',
    'Children',
    'Youth',
    'Men',
    'Women',
    'Choir and Music',
    'Ushering and Protocol',
    'Media and Technical',
    'Prayer',
    'Welfare and Outreach',
    'Other',
  ],
};

export const departmentsFor = (organizationType: string | undefined): string[] => LISTS[organizationType ?? ''] ?? LISTS.corporate;

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The listed spelling of a stored value ("MARKETING" shows as "Marketing"), or null when it isn't on the list. */
export function listedDepartment(organizationType: string | undefined, stored: string | null | undefined): string | null {
  if (!stored) return null;
  return departmentsFor(organizationType).find((d) => key(d) === key(stored)) ?? null;
}
