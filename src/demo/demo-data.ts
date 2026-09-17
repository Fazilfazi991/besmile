export type DemoPatient = { id: string; slug: string; patient_number: string; full_name: string; age: number; status: string; treatment: string; clinician: string; nextAppointment: string; notes: number; progress: number; source: string };

export const demoUser = { id: 'demo-alex-morgan', full_name: 'Alex Morgan', role: 'super_admin', designation: 'Demo Administrator', email: 'alex.morgan@example.test' };

export const demoPatients: DemoPatient[] = [
  ['001','Amara Vale',31,'Active care','Wellbeing plan','Dr. Aisha Rahman','Today, 3:30 PM',4,72,'Website'],
  ['002','Theo Mercer',38,'Active care','Stress management','Dr. Daniel Carter','Tomorrow, 10:00 AM',6,58,'Referral'],
  ['003','Nia Sterling',26,'Review due','Career counselling','Maya Patel','18 Sep, 2:00 PM',3,84,'Walk-in'],
  ['004','Elias Rowan',42,'Active care','Family support','Dr. Aisha Rahman','19 Sep, 11:30 AM',8,46,'Website'],
  ['005','Zara Linden',29,'New intake','Initial consultation','Maya Patel','20 Sep, 9:00 AM',1,18,'Referral'],
  ['006','Owen Hart',35,'Active care','Sleep improvement','Dr. Daniel Carter','20 Sep, 4:00 PM',5,67,'Website'],
  ['007','Lina Ford',33,'Follow-up','Anxiety support','Maya Patel','23 Sep, 1:00 PM',7,79,'Community'],
  ['008','Rafi Quinn',40,'Review due','Workplace wellbeing','Dr. Aisha Rahman','24 Sep, 10:30 AM',2,52,'Website'],
  ['009','Cleo Winters',27,'Active care','Confidence building','Maya Patel','24 Sep, 3:00 PM',4,64,'Referral'],
  ['010','Jonas Reed',45,'New intake','Initial consultation','Dr. Daniel Carter','25 Sep, 12:00 PM',1,12,'Walk-in'],
].map(([number, name, age, status, treatment, clinician, nextAppointment, notes, progress, source]) => ({ id: `demo-patient-${number}`, slug: `demo-${String(name).toLowerCase().replaceAll(' ', '-')}`, patient_number: `DEMO-PAT-${number}`, full_name: String(name), age: Number(age), status: String(status), treatment: String(treatment), clinician: String(clinician), nextAppointment: String(nextAppointment), notes: Number(notes), progress: Number(progress), source: String(source) }));

export const demoTasks = [
  { id: 'task-1', title: 'Review new intake summaries', due: 'Today', priority: 'High', status: 'In progress' },
  { id: 'task-2', title: 'Confirm next-week appointments', due: 'Tomorrow', priority: 'Medium', status: 'To do' },
  { id: 'task-3', title: 'Prepare weekly care overview', due: 'Friday', priority: 'Medium', status: 'To do' },
];

export const demoNotifications = [
  { id: 'notice-1', title: 'Schedule updated', body: 'Two client appointments were confirmed for tomorrow.', when: '8 min ago', read: false },
  { id: 'notice-2', title: 'Care plan review due', body: 'Nia Sterling is ready for a progress review.', when: '42 min ago', read: false },
  { id: 'notice-3', title: 'Team handoff complete', body: 'Daniel Carter shared a follow-up summary.', when: 'Yesterday', read: true },
];

export const demoAppointments = demoPatients.slice(0, 6).map((patient, index) => ({ id: `appointment-${index}`, patient: patient.full_name, clinician: patient.clinician, time: ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00'][index], status: index === 2 ? 'Completed' : index === 4 ? 'Pending' : 'Confirmed', treatment: patient.treatment }));

export const demoMetrics = { activeClients: 18, appointmentsThisWeek: 26, carePlansOnTrack: 14, openTasks: 7 };
