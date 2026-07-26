import {describe,expect,it} from 'vitest';
import {isOverdue,taskMatches} from './task-rules';
describe('task rules',()=>{it('marks incomplete past-due work as overdue',()=>{expect(isOverdue({status:'todo',due_date:'2026-07-19'},'2026-07-20')).toBe(true);expect(isOverdue({status:'completed',due_date:'2026-07-19'},'2026-07-20')).toBe(false)});it('filters status and priority',()=>{expect(taskMatches({status:'todo',priority:'high'},'todo','high')).toBe(true);expect(taskMatches({status:'todo',priority:'high'},'completed','')).toBe(false)})});
