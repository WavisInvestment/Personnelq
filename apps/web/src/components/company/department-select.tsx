'use client';

import { departmentsFor, listedDepartment } from '@/lib/departments';
import { termsFor } from '@/lib/company';

/**
 * Choose a department from the list the website provides. A value saved earlier that isn't on the list (typed
 * before the list existed) is still shown, so nothing silently changes, but only listed ones can be picked.
 */
export function DepartmentSelect({
  orgType,
  value,
  onChange,
  disabled,
  label,
  compact,
  ariaLabel,
}: {
  orgType: string;
  /** What is stored for the person or invitation ('' or null for none). */
  value: string | null;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** A visible label (for forms). Without one, pass ariaLabel (for table cells). */
  label?: string;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const terms = termsFor(orgType);
  const listed = listedDepartment(orgType, value);
  const current = listed ?? (value ? value : '');
  const outsideList = !!value && !listed;

  const select = (
    <select
      value={current}
      disabled={disabled}
      aria-label={label ? undefined : ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={
        compact
          ? 'h-9 max-w-[11rem] rounded-lg border border-line-strong bg-white px-2 text-sm disabled:opacity-60'
          : 'mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal disabled:opacity-60'
      }
    >
      <option value="">{compact ? 'None' : `No ${terms.unit.toLowerCase()}`}</option>
      {outsideList && <option value={value!}>{value} (not on the list)</option>}
      {departmentsFor(orgType).map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );

  if (!label) return select;
  return (
    <label className="block text-sm font-medium">
      {label}
      {select}
    </label>
  );
}
