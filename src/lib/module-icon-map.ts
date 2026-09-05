// This is the source of truth for first-class navigation, module and dashboard
// icon assignments. Values are Lucide component names.
export const SEMANTIC_ICON_NAMES = {
  'Overview': 'LayoutDashboard', 'Dashboard': 'LayoutDashboard', 'Home': 'LayoutDashboard',
  'Operations': 'Workflow', 'Work Management': 'BriefcaseBusiness', 'My Work': 'BriefcaseBusiness',
  'Communication': 'RadioTower', 'CRM': 'Target', 'Finance': 'WalletCards',
  'Data & Settings': 'Database', 'All Modules': 'Grid3X3', 'Create': 'CirclePlus',
  'Employees': 'UsersRound', 'People': 'UsersRound', 'My Profile': 'UserRound',
  'Staff Attendance': 'UserCheck', 'My Attendance': 'Clock3', 'Attendance': 'UserCheck',
  'Leave Approvals': 'CalendarCheck', 'Leave Requests': 'CalendarHeart', 'My Leave': 'CalendarHeart',
  'Leave': 'CalendarHeart', 'Tasks': 'ListChecks', 'Task': 'ListChecks', 'My Tasks': 'ListChecks',
  'Manage Tasks': 'ClipboardCheck', 'Task Access': 'ClipboardList', 'Calendar': 'CalendarDays',
  'My Calendar': 'CalendarDays', 'Holiday Calendar': 'CalendarRange', 'Meetings': 'Video',
  'Meeting': 'Video', 'Appointment & Scheduling': 'CalendarClock', 'Scheduling': 'CalendarClock',
  'Innovation Hub': 'Lightbulb', 'Innovation Categories': 'Tags', 'Chat': 'MessagesSquare',
  'Announcements': 'Megaphone', 'Announcement': 'Megaphone', 'Notifications': 'Bell',
  'Customer Feedback': 'MessageSquareHeart', 'CRM Overview': 'ChartNoAxesCombined',
  'Leads': 'UserRoundSearch', 'My Leads': 'UserRoundSearch', 'Follow-ups': 'PhoneCall',
  'My Follow-ups': 'PhoneCall', 'Import Leads': 'Upload', 'Sales': 'Handshake',
  'My Sales': 'Handshake', 'Clients': 'ContactRound', 'Client': 'ContactRound',
  'Patients': 'ContactRound', 'Patient': 'ContactRound', 'Assigned Clients': 'UserRoundCheck',
  'Finance Dashboard': 'Landmark', 'Income': 'CircleDollarSign', 'Revenue': 'CircleDollarSign',
  'Expenses': 'TrendingDown', 'Expense': 'TrendingDown', 'Invoices': 'ReceiptText',
  'Create invoice': 'ReceiptText', 'Payroll': 'Banknote', 'Salary': 'Banknote',
  'Psychologist Payments': 'HandCoins', 'Finance Reports': 'FileChartColumn',
  'Reports': 'FileChartColumn', 'Operational Reports': 'FileChartColumn',
  'Official Documents': 'FileText', 'Operational Documents': 'FolderOpen',
  'My Documents': 'FolderOpen', 'Documents': 'FolderOpen', 'Document': 'FileText',
  'Roles & Access': 'ShieldCheck', 'Settings': 'Settings', 'System': 'Settings', 'Search': 'Search',
  'Add employee': 'UserCog', 'New lead': 'UserRoundSearch', 'Request leave': 'CalendarHeart',
  'Submit idea': 'Lightbulb', 'Grant access': 'ShieldCheck', 'View reports': 'FileChartColumn',
  'Upload': 'FileUp', 'Approval': 'CheckCheck', 'Open related': 'ChevronRight', 'Payroll items': 'BadgeDollarSign',
  'Document reviews': 'FileText', 'Overdue tasks': 'AlarmClock',
  'Leave requests': 'CalendarCheck', 'Feedback': 'MessageSquareHeart',
  'Assigned client': 'UserRoundCheck', 'Settings & Data': 'SlidersHorizontal', 'Care': 'HeartHandshake',
} as const;

export type SemanticIconLabel = keyof typeof SEMANTIC_ICON_NAMES;

export const iconNameForLabel = (label: string): string =>
  SEMANTIC_ICON_NAMES[label as SemanticIconLabel] ?? 'PanelsTopLeft';
