import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { getCurrentUser, getUserRole, hasPermission, ROLE_LABELS, logoutUser } from '../utils/permissions';
import { getBusinessTerminology, BusinessTerminology } from '../utils/business-terminology';

interface SubItem {
  title: string;
  path: string;
  badge?: string;
  roles?: string[];
}

interface MenuItem {
  title: string;
  icon: string;
  path?: string;
  badge?: string;
  roles?: string[];
  subItems?: SubItem[];
}

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [terms, setTerms] = useState<BusinessTerminology>(() => getBusinessTerminology());
  const userObj = getCurrentUser();
  const userRole = getUserRole();
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({
    'المبيعات و POS': true,
    'المالية والتقارير': true,
  });

  useEffect(() => {
    const handler = () => setTerms(getBusinessTerminology());
    window.addEventListener('dawacore-business-type-changed', handler);
    return () => window.removeEventListener('dawacore-business-type-changed', handler);
  }, []);

  const toggleSubMenu = (title: string) => {
    setOpenSubMenus((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const rawMenuSections: { section: string; roles?: string[]; items: MenuItem[] }[] = [
    {
      section: 'العمليات المباشرة',
      items: [
        {
          title: 'لوحة تحكم المدير',
          icon: '📊',
          path: '/dashboard',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
        },
        {
          title: 'المبيعات و POS',
          icon: '🛒',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER'],
          subItems: [
            { title: 'نقطة البيع السريعة', path: '/pos', badge: 'F4', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
            { title: 'سجل فواتير المبيعات', path: '/sales/invoices', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT'] },
            { title: 'الورديات والصندوق', path: '/shifts', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT'] },
            { title: 'الفواتير المعلقة', path: '/pos/held', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
            { title: 'مرتجع مبيعات', path: '/sales/returns', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
          ],
        },
      ],
    },
    {
      section: terms.inventorySectionTitle,
      roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER'],
      items: [
        {
          title: `${terms.itemPlural} والمخزون`,
          icon: terms.icon,
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER'],
          subItems: [
            { title: terms.catalogMenuTitle, path: '/medicines' },
            { title: terms.batchesMenuTitle, path: '/batches' },
            { title: 'كرت حركة المخزن (كارت الصنف)', path: '/reports/item-card' },
            
            { title: 'الجرد والتسويات المخزنية', path: '/stock-count' },
            { title: 'تحويلات الفروع', path: '/transfers' },
          ],
        },
        {
          title: 'المشتريات والتوريد',
          icon: '🚚',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT'],
          subItems: [
            { title: 'استلام مشتريات', path: '/purchasing/receive' },
            { title: 'أوامر الشراء', path: '/purchasing/orders' },
            { title: 'الموردين', path: '/suppliers' },
          ],
        },
      ],
    },
    {
      section: 'المالية والتقارير',
      items: [
        {
          title: 'مركز التقارير الشامل',
          icon: '📊',
          path: '/reports',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
        },
        {
          title: 'التقارير المالية الأساسية',
          icon: '📑',
          path: '/accounting/reports',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
        },
        {
          title: 'الميزانية العمومية (المركز المالي)',
          icon: '🏛️',
          path: '/reports/balance-sheet',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
        },
        {
          title: 'السنوات المالية والإقفال',
          icon: '📅',
          path: '/accounting/fiscal-years',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'],
        },
        {
          title: 'الحسابات والعملاء',
          icon: '👥',
          subItems: [
            {
              title: 'شجرة الحسابات (دليل)',
              path: '/accounting/accounts',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'],
            },
            {
              title: 'الأرصدة الافتتاحية المحاسبية',
              path: '/opening-balance',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
            },
            {
              title: 'سندات القبض (إيرادات متنوعة)',
              path: '/receipts',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
            },
            {
              title: 'سندات الصرف والالتزامات',
              path: '/expenses',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
            },
            {
              title: 'دفتر الأستاذ والقيود',
              path: '/accounting/ledger',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'],
            },
            {
              title: 'كشف حساب تفصيلي',
              path: '/statement',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER'],
            },
            {
              title: 'العملاء والبيع الآجل',
              path: '/customers',
              roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
            },
          ],
        },
      ],
    },
    {
      section: 'إدارة الكيان والفروع',
      roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
      items: [
        {
          title: 'الشركات والكيانات',
          icon: '🏢',
          path: '/companies',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
        },
        {
          title: 'فروع الصيدليات',
          icon: '📍',
          path: '/branches',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
        },
      ],
    },
    {
      section: 'الأمان والمستخدمين',
      items: [
        {
          title: 'المستخدمين والصلاحيات',
          icon: '🛡️',
          path: '/users-management',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
        },
        {
          title: 'سجل الرقابة ومتابعة المستخدمين',
          icon: '🕵️‍♂️',
          path: '/audit-logs',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER'],
        },
        {
          title: 'شاشة العميل الإعلانية',
          icon: '🖥️',
          path: '/customer-screen',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER'],
        },
      ],
    },
    {
      section: 'النظام والإعدادات',
      roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
      items: [
        {
          title: 'إعدادات النظام والعملات',
          icon: '⚙️',
          path: '/settings',
          roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'],
        },
      ],
    },
  ];

  // تصفية الأقسام والعناصر بناءً على صلاحيات دور المستخدم
  const menuSections = rawMenuSections
    .filter((sec) => !sec.roles || hasPermission(sec.roles))
    .map((sec) => {
      const filteredItems = sec.items
        .filter((item) => !item.roles || hasPermission(item.roles))
        .map((item) => {
          if (item.subItems) {
            const filteredSub = item.subItems.filter(
              (sub) => !sub.roles || hasPermission(sub.roles)
            );
            return { ...item, subItems: filteredSub };
          }
          return item;
        })
        .filter((item) => !item.subItems || item.subItems.length > 0);

      return { ...sec, items: filteredItems };
    })
    .filter((sec) => sec.items.length > 0);

  return (
    <aside
      className={`fixed lg:static inset-y-0 right-0 h-screen bg-[#582949] text-white flex flex-col transition-all duration-300 shadow-xl z-50 lg:z-20 ${
        mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      } ${isCollapsed ? 'w-64 lg:w-20' : 'w-64'}`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-black/10">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="DawaCore Logo"
              className="w-9 h-9 rounded-xl object-cover shadow-lg border border-white/20"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm tracking-wide text-white leading-tight">
                  DawaCore
                </h1>
                <span className="text-[9px] bg-[#00A8A8] text-white px-1.5 py-0.2 rounded font-bold">v1.0</span>
              </div>
              <p className="text-[10px] text-[#00A8A8] font-medium leading-tight">
                {terms.labelAr}
              </p>
            </div>
          </div>
        )}

        {isCollapsed && (
          <img
            src="/logo.png"
            alt="DawaCore Logo"
            className="w-9 h-9 rounded-xl object-cover shadow-lg mx-auto border border-white/20"
          />
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:inline-flex p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition text-xs"
            title={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {isCollapsed ? '◀' : '▶'}
          </button>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition text-sm font-bold"
              title="إغلاق القائمة"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 custom-scrollbar">
        {/* Quick Launch POS Button */}
        <div className="px-1 mb-2">
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl text-xs font-black shadow-md transition ${
                isActive
                  ? 'bg-[#00A8A8] text-white ring-2 ring-teal-300'
                  : 'bg-[#00A8A8] text-white hover:bg-[#009292]'
              }`
            }
            title="نقطة البيع السريعة (F4)"
          >
            <span className="text-base">🛒</span>
            {!isCollapsed && <span>نقطة البيع السريعة (POS)</span>}
          </NavLink>
        </div>

        {menuSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!isCollapsed && (
              <h2 className="px-3 text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1">
                {section.section}
              </h2>
            )}

            {section.items.map((item, iIdx) => {
              if (item.subItems) {
                const isOpen = !!openSubMenus[item.title];
                return (
                  <div key={iIdx} className="space-y-0.5">
                    <button
                      onClick={() => toggleSubMenu(item.title)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                        isOpen ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{item.icon}</span>
                        {!isCollapsed && <span>{item.title}</span>}
                      </div>
                      {!isCollapsed && (
                        <span className="text-[10px] opacity-60">{isOpen ? '▼' : '◀'}</span>
                      )}
                    </button>

                    {!isCollapsed && isOpen && (
                      <div className="mr-6 pr-2 border-r border-white/10 space-y-0.5 mt-1">
                        {item.subItems.map((sub, subIdx) => (
                          <NavLink
                            key={subIdx}
                            to={sub.path}
                            className={({ isActive }) =>
                              `flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                isActive
                                  ? 'bg-[#00A8A8] text-white font-bold shadow-sm'
                                  : 'text-white/70 hover:text-white hover:bg-white/5'
                              }`
                            }
                          >
                            <span>{sub.title}</span>
                            {sub.badge && (
                              <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-mono">
                                {sub.badge}
                              </span>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.path === '/customer-screen') {
                return (
                  <button
                    key={iIdx}
                    type="button"
                    onClick={() => window.open('/customer-screen', 'CustomerDisplay', 'width=1024,height=768')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:bg-white/5 hover:text-white transition cursor-pointer text-right"
                    title="فتح شاشة العميل الإعلانية في نافذة منفصلة للشاشة الثانية"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{item.icon}</span>
                      {!isCollapsed && <span>{item.title}</span>}
                    </div>
                    {!isCollapsed && (
                      <span className="px-1.5 py-0.5 rounded bg-[#00A8A8] text-[10px] font-bold text-white shadow-2xs">
                        شاشة 2 ↗
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <NavLink
                  key={iIdx}
                  to={item.path || '/'}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? 'bg-[#00A8A8] text-white font-bold shadow-sm'
                        : 'text-white/80 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{item.icon}</span>
                    {!isCollapsed && <span>{item.title}</span>}
                  </div>
                  {!isCollapsed && item.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-mono">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-3 border-t border-white/10 bg-black/20">
        {!isCollapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-xs border border-white/10 shrink-0">
                {userObj?.name ? userObj.name.charAt(0) : '👤'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {userObj?.name || userObj?.fullName || userObj?.username || 'مستخدم النظام'}
                </p>
                <p className="text-[10px] text-teal-300 truncate leading-tight font-medium">
                  {userRole ? ROLE_LABELS[userRole] || userRole : 'مستخدم'}
                </p>
              </div>
            </div>
            <button
              onClick={logoutUser}
              className="p-1.5 text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 rounded-lg transition text-xs"
              title="تسجيل الخروج الآمن"
            >
              🚪
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button onClick={logoutUser} className="p-1.5 text-rose-300 text-xs hover:bg-rose-500/20 rounded-lg transition" title="تسجيل الخروج">
              🚪
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
