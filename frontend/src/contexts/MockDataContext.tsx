import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { mockAutoPostConfigs, mockContent, mockPublishJobs } from '../api/mock/data';
import type { AutoPostConfig, AutoPostSlot, ContentAsset, PublishJob } from '../types';

interface MockDataContextValue {
  content: ContentAsset[];
  publishJobs: PublishJob[];
  autoPostConfigs: AutoPostConfig[];
  addContent: (item: ContentAsset) => void;
  updateContent: (id: string, patch: Partial<ContentAsset>) => void;
  deleteContent: (id: string) => void;
  setPageAutoPostEnabled: (pageId: string, enabled: boolean) => void;
  addSlot: (slot: AutoPostSlot) => void;
  updateSlot: (slotId: string, patch: Partial<AutoPostSlot>) => void;
  removeSlot: (slotId: string) => void;
}

const MockDataContext = createContext<MockDataContextValue | null>(null);

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ContentAsset[]>(mockContent);
  const [publishJobs] = useState<PublishJob[]>(mockPublishJobs);
  const [autoPostConfigs, setAutoPostConfigs] =
    useState<AutoPostConfig[]>(mockAutoPostConfigs);

  const value = useMemo<MockDataContextValue>(
    () => ({
      content,
      publishJobs,
      autoPostConfigs,
      addContent: (item) => setContent((prev) => [item, ...prev]),
      updateContent: (id, patch) =>
        setContent((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, ...patch, updatedAt: new Date().toISOString() }
              : item,
          ),
        ),
      deleteContent: (id) => setContent((prev) => prev.filter((item) => item.id !== id)),
      setPageAutoPostEnabled: (pageId, enabled) =>
        setAutoPostConfigs((prev) => {
          const exists = prev.some((c) => c.pageId === pageId);
          if (!exists) return [...prev, { pageId, enabled, slots: [] }];
          return prev.map((c) => (c.pageId === pageId ? { ...c, enabled } : c));
        }),
      addSlot: (slot) =>
        setAutoPostConfigs((prev) => {
          const exists = prev.some((c) => c.pageId === slot.pageId);
          if (!exists) {
            return [...prev, { pageId: slot.pageId, enabled: true, slots: [slot] }];
          }
          return prev.map((c) =>
            c.pageId === slot.pageId ? { ...c, slots: [...c.slots, slot] } : c,
          );
        }),
      updateSlot: (slotId, patch) =>
        setAutoPostConfigs((prev) =>
          prev.map((c) => ({
            ...c,
            slots: c.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
          })),
        ),
      removeSlot: (slotId) =>
        setAutoPostConfigs((prev) =>
          prev.map((c) => ({ ...c, slots: c.slots.filter((s) => s.id !== slotId) })),
        ),
    }),
    [content, publishJobs, autoPostConfigs],
  );

  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>;
}

export function useMockData() {
  const ctx = useContext(MockDataContext);
  if (!ctx) throw new Error('useMockData must be used within MockDataProvider');
  return ctx;
}
