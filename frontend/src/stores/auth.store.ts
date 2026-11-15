import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  fullName?: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  roles?: string[];
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  businessType?: 'PHARMACY' | 'SUPERMARKET' | 'TRADING' | 'CLOTHING' | string;
  branchId?: string;
  branchName?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  updateUserCompanyContext: (patch: Partial<Pick<User, 'companyName' | 'companyLogoUrl' | 'businessType'>>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        set({ user, token });
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('dawacore_user', JSON.stringify(user));
            localStorage.setItem('dawacore_token', token);
            localStorage.removeItem('dawacore_business_type');
          } catch {}
          window.dispatchEvent(
            new CustomEvent('dawacore-business-type-changed', {
              detail: user?.businessType || 'PHARMACY',
            }),
          );
        }
      },
      updateUserCompanyContext: (patch) => {
        const current = get().user;
        if (!current) return;
        const updated: User = { ...current, ...patch };
        set({ user: updated });
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('dawacore_user');
            const parsed = raw ? JSON.parse(raw) : {};
            localStorage.setItem('dawacore_user', JSON.stringify({ ...parsed, ...patch }));
          } catch {}
          if (patch.businessType) {
            window.dispatchEvent(
              new CustomEvent('dawacore-business-type-changed', {
                detail: patch.businessType,
              }),
            );
          }
        }
      },
      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('dawacore_token');
            localStorage.removeItem('dawacore_user');
            localStorage.removeItem('dawacore_business_type');
            localStorage.setItem(
              'dawacore-auth',
              JSON.stringify({ state: { user: null, token: null }, version: 0 }),
            );
          } catch {}
          window.dispatchEvent(
            new CustomEvent('dawacore-business-type-changed', {
              detail: 'PHARMACY',
            }),
          );
        }
      },
    }),
    { name: 'dawacore-auth' },
  ),
);
