import React, { useState, useEffect } from 'react';

interface UserData {
  id: string;
  username: string;
  fullName: string;
  role: string;
  roleDescription: string;
  branch: string;
  branchId: string;
  isActive: boolean;
  hasPinCode: boolean;
  createdAt: string;
}

export const UsersManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    fullName: '',
    password: '',
    pinCode: '',
    role: 'CASHIER',
  });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/auth/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.fullName || !newUser.password) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      const branchId = users[0]?.branchId || '451d6ca9-b7d1-4c78-9816-e29f85d3f715';
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUser, branchId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'فشل إضافة المستخدم');
      }

      setIsModalOpen(false);
      setNewUser({ username: '', fullName: '', password: '', pinCode: '', role: 'CASHIER' });
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen font-sans text-slate-800" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#582949]">إدارة المستخدمين والصلاحيات (RBAC)</h1>
          <p className="text-xs text-slate-500">التحكم في وصول الموظفين، الأدوار المخولة، ورموز PIN للعمليات الحساسة</p>
        </div>
        <button
          onClick={() => {
            setErrorMsg('');
            setIsModalOpen(true);
          }}
          className="rounded-xl bg-[#00A8A8] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#009292] transition flex items-center gap-2 cursor-pointer"
        >
          <span>➕</span> إضافة مستخدم جديد
        </button>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-500 font-bold">
              <th className="py-3.5 px-4">الموظف</th>
              <th className="py-3.5 px-4">اسم المستخدم</th>
              <th className="py-3.5 px-4">الدور الوظيفي</th>
              <th className="py-3.5 px-4">الفرع</th>
              <th className="py-3.5 px-4 text-center">رمز PIN</th>
              <th className="py-3.5 px-4 text-center">الحالة</th>
              <th className="py-3.5 px-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y font-medium">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">جارٍ تحميل بيانات المستخدمين...</td>
              </tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-800">{u.fullName}</td>
                <td className="py-3 px-4 font-mono text-slate-600">{u.username}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block rounded-md px-2.5 py-1 text-[10px] font-bold ${
                    u.role === 'SUPER_ADMIN' ? 'bg-rose-100 text-rose-800' :
                    u.role === 'BRANCH_ADMIN' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'CASHIER' ? 'bg-teal-100 text-teal-700' :
                    u.role === 'PHARMACIST' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">{u.branch}</td>
                <td className="py-3 px-4 text-center">
                  {u.hasPinCode ? (
                    <span className="text-emerald-600 font-bold">✓ مفعل</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {u.isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                      نشط
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-500">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      معطل
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => handleToggleStatus(u.id, u.isActive)}
                    className={`font-bold text-xs ${u.isActive ? 'text-red-500 hover:underline' : 'text-emerald-600 hover:underline'}`}
                  >
                    {u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal إضافة مستخدم جديد */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="text-lg font-black text-[#582949]">إضافة مستخدم جديد للنظام</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl bg-red-50 p-2.5 text-xs font-bold text-red-600">
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الاسم الكامل للموظف:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: خالد عبد الله"
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-[#00A8A8]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المستخدم (للدخول):</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: khaled_pos"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-[#00A8A8]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">كلمة المرور:</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-[#00A8A8]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رمز PIN للمدير (اختياري - 4 أرقام):</label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="مثال: 1234"
                  value={newUser.pinCode}
                  onChange={(e) => setNewUser({ ...newUser, pinCode: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-[#00A8A8]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الدور الوظيفي والصلاحيات:</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-[#00A8A8]"
                >
                  <option value="CASHIER">CASHIER (كاشير مبيعات)</option>
                  <option value="BRANCH_ADMIN">BRANCH_ADMIN (مدير فرع)</option>
                  <option value="PHARMACIST">PHARMACIST (صيدلي مخزني)</option>
                  <option value="ACCOUNTANT">ACCOUNTANT (محاسب مالي)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (مدير عام)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-600 hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#00A8A8] px-5 py-2 font-bold text-white shadow hover:bg-[#009292]"
                >
                  حفظ المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
