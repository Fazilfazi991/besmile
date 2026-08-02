// employee_salary_settings has two profile relationships: profile_id is the
// employee and updated_by is the audit actor. Keep this relationship explicit.
export const employeeSalarySettingsSelect = '*,employee:profiles!employee_salary_settings_profile_id_fkey(id,full_name,email,employee_code,designation,status,department:departments(name))';

export const payrollLoadError = 'Payroll data could not be loaded. Please try again.';
