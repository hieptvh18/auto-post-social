import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { mockContent, mockPublishJobs } from '../api/mock/data';
import type { ContentAsset, PublishJob } from '../types';

interface MockDataContextValue {
  content: ContentAsset[];
  publishJobs: PublishJob[];
  addContent: (item: ContentAsset) => void;
  updateContent: (id: string, patch: Partial<ContentAsset>) => void;
  submitContent: (id: string) => void;
  approveContent: (id: string, approvedBy: string) => void;
  rejectContent: (id: string, comment: string) => void;
  addPublishJob: (job: PublishJob) => void;
}

const MockDataContext = createContext<MockDataContextValue | null>(null);

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ContentAsset[]>(mockContent);
  const [publishJobs, setPublishJobs] = useState<PublishJob[]>(mockPublishJobs);

  const value = useMemo<MockDataContextValue>(
    () => ({
      content,
      publishJobs,
      addContent: (item) => setContent((prev) => [item, ...prev]),
      updateContent: (id, patch) =>
        setContent((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)),
        ),
      submitContent: (id) =>
        setContent((prev) =>
          prev.map((item) =>
            item.id === id && (item.status === 'DRAFT' || item.status === 'REJECTED')
              ? { ...item, status: 'WAITING_APPROVAL', rejectComment: null, updatedAt: new Date().toISOString() }
              : item,
          ),
        ),
      approveContent: (id, approvedBy) =>
        setContent((prev) =>
          prev.map((item) =>
            item.id === id && item.status === 'WAITING_APPROVAL'
              ? { ...item, status: 'APPROVED', approvedBy, updatedAt: new Date().toISOString() }
              : item,
          ),
        ),
      rejectContent: (id, comment) =>
        setContent((prev) =>
          prev.map((item) =>
            item.id === id && item.status === 'WAITING_APPROVAL'
              ? {
                  ...item,
                  status: 'REJECTED',
                  approvedBy: null,
                  rejectComment: comment,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        ),
      addPublishJob: (job) => setPublishJobs((prev) => [...prev, job]),
    }),
    [content, publishJobs],
  );

  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>;
}

export function useMockData() {
  const ctx = useContext(MockDataContext);
  if (!ctx) throw new Error('useMockData must be used within MockDataProvider');
  return ctx;
}
