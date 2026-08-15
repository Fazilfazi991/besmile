import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const compatibilityMigration=readFileSync(join(process.cwd(),'supabase/migrations/20260815134500_batch14_production_role_compatibility.sql'),'utf8');
const navigation=readFileSync(join(process.cwd(),'src/lib/permission-access.ts'),'utf8');

describe('Policy Assistant production RBAC compatibility',()=>{
  it('uses only valid legacy employee roles and has no Super Admin enum dependency',()=>{
    expect(compatibilityMigration).not.toContain('Super Admin');
    expect(compatibilityMigration).not.toContain('super_admin');
    expect(compatibilityMigration).toContain("('Staff'),('Psychologist'),('Intern'),('General Manager'),('Director'),('Chairman')");
    expect(compatibilityMigration).toContain("('General Manager'),('Director'),('Chairman')");
  });

  it('keeps policy management limited to management roles while separating policy use',()=>{
    const managementSeed=compatibilityMigration.slice(compatibilityMigration.indexOf("from (values ('General Manager')"),compatibilityMigration.indexOf("$seed$;\n  end if",compatibilityMigration.indexOf("from (values ('General Manager')")));
    expect(managementSeed).toContain("('General Manager'),('Director'),('Chairman')");
    expect(managementSeed).not.toContain('Staff');
    expect(compatibilityMigration).toContain("permission.code='policy_assistant.use'");
    expect(compatibilityMigration).toContain("permission.code='policy_assistant.manage'");
  });

  it('keeps Policy Assistant navigation permission-gated',()=>{
    expect(navigation).toContain("requirement: anyOf('policy_assistant.use')");
    expect(navigation).toContain("requirement: anyOf('policy_assistant.manage')");
  });
});
