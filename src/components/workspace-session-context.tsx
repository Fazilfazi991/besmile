'use client';

import { createContext, useContext, type ReactNode } from 'react';

type WorkspaceProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  designation: string | null;
  status: string | null;
};

type WorkspaceSession = {
  profile: WorkspaceProfile;
  permissions: string[];
};

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

export function WorkspaceSessionProvider({ value, children }: { value: WorkspaceSession; children: ReactNode }) {
  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error('Workspace session is unavailable outside its layout.');
  return session;
}
