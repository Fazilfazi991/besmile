import { isOverdue, type TaskStatus } from './task-rules';

export type TaskAssignment = { id: string; status: TaskStatus; tasks?: { due_date: string | null; status: string } };

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
