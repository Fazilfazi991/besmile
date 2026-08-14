export type WorkloadRow = {
  id: string;
  full_name: string;
  open_tasks: number;
  overdue_tasks: number;
  due_today_tasks: number;
  on_leave: boolean;
  attendance_recorded: boolean;
};

export function attentionItems(rows: WorkloadRow[], highWorkloadThreshold = 8) {
  return rows.flatMap((row) => {
    const items: { employeeId: string; employeeName: string; kind: 'overdue' | 'due_today' | 'high_workload' | 'no_open_tasks'; detail: string }[] = [];
    if (row.overdue_tasks) items.push({ employeeId: row.id, employeeName: row.full_name, kind: 'overdue', detail: `${row.overdue_tasks} overdue current task${row.overdue_tasks === 1 ? '' : 's'}` });
    if (row.due_today_tasks) items.push({ employeeId: row.id, employeeName: row.full_name, kind: 'due_today', detail: `${row.due_today_tasks} current task${row.due_today_tasks === 1 ? '' : 's'} due today` });
    if (row.open_tasks >= highWorkloadThreshold) items.push({ employeeId: row.id, employeeName: row.full_name, kind: 'high_workload', detail: `${row.open_tasks} current open tasks (attention threshold: ${highWorkloadThreshold})` });
    if (!row.open_tasks) items.push({ employeeId: row.id, employeeName: row.full_name, kind: 'no_open_tasks', detail: 'No current open tasks' });
    return items;
  });
}
