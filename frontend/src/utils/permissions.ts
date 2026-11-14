// frontend/src/utils/permissions.ts

export type AppRole =
  | 'SUPER_ADMIN'
  | 'COMPANY_ADMIN'
  | 'BRANCH_MANAGER'
  | 'CASHIER'
  | 'ACCOUNTANT'
  | 'INVENTORY'
  | 'STORE_KEEPER';

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدير النظام العام',
  COMPANY_ADMIN: 'مدير الشركة',
  BRANCH_MANAGER: 'مدير الفرع',
  CASHIER: 'كاشير / صيدلي بيع',
  ACCOUNTANT: 'محاسب مالي',
  INVENTORY: 'أمين مخزن',
  STORE_KEEPER: 'أمين مخزن',
};

export interface StoredUser {
  id: string;
  name?: string;
  fullName?: string;
  username: string;
  role: AppRole;
  roles?: AppRole[];
  branchId?: string | null;
  branchName?: string | null;
  companyId?: string;
  companyName?: string | null;
}

export function getCurrentUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('dawacore_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getUserRole(): AppRole | null {
  const user = getCurrentUser();
  if (!user) return null;
  if (user.role) return user.role;
  if (user.roles && user.roles.length > 0) return user.roles[0];
  return null;
}

export function hasPermission(allowedRoles?: string[]): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  const role = getUserRole();
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;
  return allowedRoles.includes(role);
}

export function getDefaultRouteForRole(role?: string | null): string {
  if (role === 'CASHIER') return '/pos';
  if (role === 'INVENTORY' || role === 'STORE_KEEPER') return '/medicines';
  return '/dashboard';
}

export function logoutUser() {
  localStorage.removeItem('dawacore_token');
  localStorage.removeItem('dawacore_user');
  window.location.href = '/login';
}
