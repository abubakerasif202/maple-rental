import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';

type UiState = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark',
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleThemeMode: () =>
        set({
          themeMode: get().themeMode === 'dark' ? 'light' : 'dark',
        }),
    }),
    {
      name: 'maple-ui',
    },
  ),
);
