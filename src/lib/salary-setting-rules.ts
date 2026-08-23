export type SalarySettingInput = {
  profile_id?: string;
  effective_date?: string;
  basic_salary?: string | number;
  default_allowances?: string | number;
  default_deductions?: string | number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function amount(value: string | number | undefined) {
  if (value === '' || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateSalarySetting(input: SalarySettingInput) {
  const errors: Record<string, string> = {};
  if (!input.profile_id) errors.profile_id = 'Select an employee.';
  if (!input.effective_date) errors.effective_date = 'Select an effective date.';
  else if (!datePattern.test(input.effective_date) || Number.isNaN(Date.parse(`${input.effective_date}T12:00:00Z`))) errors.effective_date = 'Select a valid effective date.';
  const basic = amount(input.basic_salary);
  const allowances = amount(input.default_allowances);
  const deductions = amount(input.default_deductions);
  if (basic === null || basic <= 0) errors.basic_salary = 'Basic salary must be greater than zero.';
  if (allowances === null || allowances < 0) errors.default_allowances = 'Enter zero or a positive allowance.';
  if (deductions === null || deductions < 0) errors.default_deductions = 'Enter zero or a positive deduction.';
  return { errors, values: { basic, allowances, deductions } };
}
