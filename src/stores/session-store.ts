import { create } from 'zustand';
import {
  createIdentity,
  getIdentity,
  updateDisplayName,
  type LoadedIdentity,
} from '../core/storage/identity';

interface SessionState {
  identity: LoadedIdentity | null;
  ready: boolean;
  load: () => Promise<void>;
  onboard: (displayName: string) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  identity: null,
  ready: false,
  load: async () => {
    const id = await getIdentity();
    set({ identity: id, ready: true });
  },
  onboard: async (displayName: string) => {
    const id = await createIdentity(displayName.trim());
    set({ identity: id });
  },
  setDisplayName: async (name: string) => {
    await updateDisplayName(name);
    const fresh = await getIdentity();
    set({ identity: fresh });
  },
}));
