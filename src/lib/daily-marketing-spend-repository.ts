import { supabase } from './supabase';
import { grantedPermissions } from './granted-permissions';

export type DailySpendEntry = {
  id: string; account_id: string; expense_subcategory: string; amount: number | string;
  payment_method: string; description: string | null; reference_number: string | null;
  updated_at: string; archived_at: string | null;
};
export type DailySpendOptions = { accounts: { id: string; name: string }[]; entries: DailySpendEntry[] };

function database() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
export const dailyMarketingSpendRepository = {
  async allowed() {
    return (await grantedPermissions(database(), ['crm.marketing_spend.manage'])).has('crm.marketing_spend.manage');
  },
  async options(date: string): Promise<DailySpendOptions> {
    const { data, error } = await database().rpc('daily_marketing_spend_options', { business_date: date });
    if (error) throw error;
    return data as DailySpendOptions;
  },
  async save(payload: { business_date: string; spend_amount: number; subtype: string; finance_account: string; method: string; details: string; reference: string; expected_updated_at: string | null }) {
    const { data, error } = await database().rpc('save_daily_marketing_spend', payload);
    if (error) throw error;
    return data as string;
  },
};
