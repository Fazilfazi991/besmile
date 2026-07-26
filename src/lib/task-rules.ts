export const taskStatuses=['todo','in_progress','completed'] as const;
export type TaskStatus=typeof taskStatuses[number];
export const taskPriorities=['low','medium','high'] as const;
export function isOverdue(task:{status:string;due_date:string|null},today=new Date().toISOString().slice(0,10)){return task.status!=='completed'&&!!task.due_date&&task.due_date<today}
export function taskMatches(task:{status:string;priority:string},status:string,priority:string){return (!status||task.status===status)&&(!priority||task.priority===priority)}
