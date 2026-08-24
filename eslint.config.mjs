import nextVitals from 'eslint-config-next/core-web-vitals';
export default [{ignores:['teams-release-final/**']},...nextVitals,{files:['src/app/page.tsx','src/app/employee/attendance/page.tsx'],rules:{'react-hooks/set-state-in-effect':'off'}}];
