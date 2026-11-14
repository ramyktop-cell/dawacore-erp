import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
export const PUBLIC_ROUTE = 'security:public';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const PERMISSION = 'security:permission';
export const Permission = (value: string) => SetMetadata(PERMISSION, value);
export interface AuthenticatedUser { id: string; companyId: string; branchId: string | null; role: Role; roles: Role[]; }
const managers = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER];
const finance = [...managers, Role.ACCOUNTANT];
const stock = [...managers, Role.INVENTORY];
const staff = [...finance, Role.INVENTORY, Role.CASHIER];
export const POLICY: Record<string, readonly Role[]> = {
 'users:directory': staff,
 'users:read': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN],
 'users:write': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN],
 'companies:read': staff, 'companies:write': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN],
 'branches:read': staff, 'branches:write': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN],
 'sales:read': [...finance, Role.CASHIER], 'sales:write': [...managers, Role.CASHIER], 'sales:price-override': managers,
 'shifts:read': [...finance, Role.CASHIER], 'shifts:write': [...managers, Role.CASHIER], 'shifts:approve': managers,
 'customers:read': [...finance, Role.CASHIER], 'customers:write': [...finance, Role.CASHIER], 'customers:delete': managers,
 'medicines:read': staff, 'medicines:write': stock,
 'batches:read': staff, 'batches:write': stock,
 'inventory:write': stock,
 'transfers:read': stock, 'transfers:write': stock,
 'purchasing:read': [...stock, Role.ACCOUNTANT], 'purchasing:write': [...stock, Role.ACCOUNTANT],
 'suppliers:read': [...stock, Role.ACCOUNTANT], 'suppliers:write': [...stock, Role.ACCOUNTANT],
 'supplier-payments:read': finance, 'supplier-payments:write': finance,
 'returns:read': [...finance, Role.CASHIER], 'returns:write': [...managers, Role.CASHIER],
 'accounts:read': finance, 'accounts:write': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ACCOUNTANT],
 'accounting:read': finance, 'accounting:write': [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ACCOUNTANT],
 'reports:read': finance, 'customer-reports:read': [...finance, Role.CASHIER],
 'stock-reports:read': [...stock, Role.ACCOUNTANT], 'dashboard:read': finance,
 'expenses:read': finance, 'expenses:write': finance, 'expenses:approve': managers,
 'receipts:read': finance, 'receipts:write': finance, 'receipts:approve': managers,
 'stock-count:read': [...stock, Role.ACCOUNTANT], 'stock-count:write': stock, 'stock-count:approve': managers,
 'opening-balance:read': finance, 'opening-balance:write': finance, 'opening-balance:approve': managers,
 'auth:verify': [...managers, Role.CASHIER],
};
