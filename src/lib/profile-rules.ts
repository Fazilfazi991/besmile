export const editableProfileFields = ['full_name','phone','personal_email','date_of_birth','gender','address','emergency_contact'] as const;
export const requiredProfileCompletionFields = [
  ['Full name','full_name'],
  ['Work email','email'],
  ['Gender','gender'],
  ['Employee ID','employee_code'],
  ['Department','department_id'],
  ['Designation','designation'],
  ['Role','role'],
] as const;
export function profileCompletion(profile:any){const missing=requiredProfileCompletionFields.filter(([,key])=>{const value=profile?.[key];return !value||!String(value).trim()}).map(([label])=>label);return {percentage:Math.round(((requiredProfileCompletionFields.length-missing.length)/requiredProfileCompletionFields.length)*100),missing};}
export function validateProfile(form:any){if(form.personal_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email))return 'Enter a valid personal email address.';if(form.phone&&String(form.phone).replace(/\D/g,'').length<7)return 'Enter a phone number with at least 7 digits.';if(form.date_of_birth&&new Date(form.date_of_birth)>new Date())return 'Date of birth cannot be in the future.';const account=form.bank_details?.account_number||'';if(account&&!/^[A-Za-z0-9 -]{4,34}$/.test(account))return 'Account number contains unsupported characters.';const ifsc=form.bank_details?.ifsc_code||'';if(ifsc&&!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc))return 'Enter a valid IFSC code.';return null;}
