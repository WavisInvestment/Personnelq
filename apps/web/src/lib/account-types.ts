export type AccountType = 'individual' | 'corporate' | 'school' | 'church';

export interface AccountTypeOption {
  value: AccountType;
  label: string;
  hint: string;
  organizationLabel?: string;
  organizationPlaceholder?: string;
}

export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  {
    value: 'individual',
    label: 'Just me',
    hint: 'Take assessments for yourself',
  },
  {
    value: 'corporate',
    label: 'A company',
    hint: 'Understand your team',
    organizationLabel: 'Company name',
    organizationPlaceholder: 'Acme Logistics',
  },
  {
    value: 'school',
    label: 'A school',
    hint: 'Students and staff',
    organizationLabel: 'School name',
    organizationPlaceholder: 'Westfield Secondary School',
  },
  {
    value: 'church',
    label: 'A church or community',
    hint: 'Members and groups',
    organizationLabel: 'Church or community name',
    organizationPlaceholder: 'Grace Chapel',
  },
];

export const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  corporate: 'Company',
  school: 'School',
  church: 'Church or community',
  professional: 'Professional practice',
};
