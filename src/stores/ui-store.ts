import { create } from 'zustand';

export type Tab = 'groups' | 'activity' | 'profile';

interface UiState {
  activeTab: Tab;
  setTab: (tab: Tab) => void;
  swUpdateAvailable: boolean;
  setSwUpdateAvailable: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  activeTab: 'groups',
  setTab: (tab) => set({ activeTab: tab }),
  swUpdateAvailable: false,
  setSwUpdateAvailable: (v) => set({ swUpdateAvailable: v }),
}));
