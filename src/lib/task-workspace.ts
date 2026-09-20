import { isOverdue, type TaskStatus } from './task-rules';

export type TaskAssignment = { id: string; status: TaskStatus; tasks?: { due_date: string | null; status: string } };
export const taskCompletionUpdateMaxLength = 2000;

const assignmentStatusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function assignmentStatusLabel(status: TaskStatus) {
  return assignmentStatusLabels[status];
}

export function assignmentWording(count: number) {
  return count === 1 ? 'assignment' : 'assignments';
}

export function assignmentProgress(assignments: readonly Pick<TaskAssignment, 'status'>[]) {
  return {
    completed: assignments.filter((assignment) => assignment.status === 'completed').length,
    total: assignments.length,
  };
}

export function assignmentProgressLabel(assignments: readonly Pick<TaskAssignment, 'status'>[], compact = false) {
  const { completed, total } = assignmentProgress(assignments);
  if (!total) return 'No assignments';
  return `${completed} of ${total}${compact ? '' : ` ${assignmentWording(total)}`} completed`;
}

export function completionUpdateError(value: string) {
  const length = value.trim().length;
  if (!length) return 'A completion update is required.';
  if (length > taskCompletionUpdateMaxLength) return `Completion update must be ${taskCompletionUpdateMaxLength.toLocaleString()} characters or fewer.`;
  return null;
}

const employeeTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress'],
  in_progress: ['completed'],
  completed: ['in_progress'],
};

export function canEmployeeChangeTaskStatus(current: TaskStatus, next: TaskStatus) {
  return current === next || employeeTransitions[current].includes(next);
}

export function applyAssignmentStatus<T extends TaskAssignment>(assignments: T[], assignmentId: string, status: TaskStatus) {
  return assignments.map((assignment) => assignment.id === assignmentId ? { ...assignment, status } : assignment);
}

export function taskCounts(assignments: TaskAssignment[], today = new Date().toISOString().slice(0, 10)) {
  return {
    todo: assignments.filter((assignment) => assignment.status === 'todo').length,
    in_progress: assignments.filter((assignment) => assignment.status === 'in_progress').length,
    completed: assignments.filter((assignment) => assignment.status === 'completed').length,
    overdue: assignments.filter((assignment) => assignment.tasks && isOverdue({ ...assignment.tasks, status: assignment.status }, today)).length,
  };
}
