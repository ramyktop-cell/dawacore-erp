import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, AccountNode } from '../api/accounts';
import { PageHeader } from '../components/common/PageHeader';
import { AccountFormModal } from '../components/accounts/AccountFormModal';
import { AccountLedgerModal } from '../components/accounts/AccountLedgerModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  Plus,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Trash2,
  Folder,
  FolderOpen,
  FileText,
  BookOpen,
  Search,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  DollarSign,
  PieChart,
  Lock,
  ShieldCheck,
} from 'lucide-react';

const LEVEL_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'رئيسي L1' },
  2: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'فرعي L2' },
  3: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'تفصيلي L3' },
  4: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'تحليلي L4' },
  5: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'تشغيلي L5' },
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ASSET: { label: 'أصول', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  LIABILITY: { label: 'خصوم', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  EQUITY: { label: 'حقوق ملكية', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  REVENUE: { label: 'إيرادات', color: 'text-teal-700 bg-teal-50 border-teal-200' },
  EXPENSE: { label: 'مصروفات', color: 'text-rose-700 bg-rose-50 border-rose-200' },
};

// المكون العودي لعرض عقد الشجرة
const TreeItem: React.FC<{
  node: AccountNode;
  depth: number;
  onEdit: (node: AccountNode) => void;
  onDelete: (node: AccountNode) => void;
  onAddChild: (parent: AccountNode) => void;
  onViewLedger: (node: AccountNode) => void;
  searchTerm: string;
}> = ({ node, depth, onEdit, onDelete, onAddChild, onViewLedger, searchTerm }) => {
  // فتح المستويات الأولى تلقائياً أو عند وجود بحث
  const [isOpen, setIsOpen] = useState(depth < 2 || !!searchTerm);

  const hasChildren = node.children && node.children.length > 0;
  const paddingRight = depth * 20;

  const lvl = LEVEL_COLORS[node.level] || { bg: 'bg-slate-100', text: 'text-slate-700', label: `L${node.level}` };
  const typeInfo = TYPE_LABELS[node.type] || { label: node.type, color: 'text-slate-600 bg-slate-50' };

  // التحقق المحاسبي: هل يمكن حذف هذا الحساب؟
  const isDeletable =
    node.level > 1 &&
    node.isLeaf &&
    (!node.children || node.children.length === 0) &&
    Math.abs(Number(node.balance || 0)) < 0.001;

  const deleteTooltip =
    node.level === 1
      ? 'لا يمكن حذف الحسابات الرئيسية (المستوى 1)'
      : !node.isLeaf || (node.children && node.children.length > 0)
      ? 'لا يمكن حذف حساب تجميعي يحتوي على حسابات فرعية'
      : Math.abs(Number(node.balance || 0)) >= 0.001
      ? `لا يمكن حذف حساب يحتوي على رصيد مالي قائم (${Number(node.balance).toLocaleString()} ج.س)`
      : 'حذف الحساب الطرفي';

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        className={`flex items-center justify-between py-2.5 px-4 hover:bg-slate-50 transition-colors cursor-pointer group ${
          !node.isActive ? 'opacity-50 line-through bg-slate-50' : ''
        }`}
        style={{ paddingRight: `${paddingRight + 16}px` }}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* أيقونة الطي والتوسيع */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
            </button>
          ) : (
            <span className="w-6" />
          )}

          {/* أيقونة نوع العقدة */}
          {hasChildren ? (
            isOpen ? (
              <FolderOpen size={18} className="text-amber-500 shrink-0" />
            ) : (
              <Folder size={18} className="text-amber-500 shrink-0" />
            )
          ) : (
            <FileText size={17} className="text-teal-600 shrink-0" />
          )}

          {/* كود واسم الحساب */}
          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
            {node.code}
          </span>
          <span className="text-xs font-black text-slate-800 truncate">{node.name}</span>

          {/* شارة المستوى */}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${lvl.bg} ${lvl.text} shrink-0`}>
            {lvl.label}
          </span>

          {/* شارة نوع الحساب */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.color} shrink-0`}>
            {typeInfo.label}
          </span>

          {/* حالة الحساب الطرفي */}
          {node.isLeaf && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={10} /> طرفي
            </span>
          )}
        </div>

        {/* الأرصدة والإجراءات */}
        <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* الرصيد المباشر للحسابات الطرفية */}
          {node.isLeaf ? (
            <div className="text-left font-mono">
              <span className={`text-xs font-black ${Number(node.balance) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {Number(node.balance).toLocaleString()} ج.س
              </span>
              <p className="text-[9px] text-slate-400 font-sans">رصيد مباشر</p>
            </div>
          ) : (
            <div className="text-left font-mono">
              <span className="text-xs font-black text-indigo-700">
                {Number(node.totalBalance || 0).toLocaleString()} ج.س
              </span>
              <p className="text-[9px] text-indigo-400 font-sans">إجمالي تراكمي</p>
            </div>
          )}

          {/* أزرار الإجراءات */}
          <div className="flex items-center gap-1">
            {node.isLeaf && (
              <button
                onClick={() => onViewLedger(node)}
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                title={`كشف حساب تفصيلي لـ ${node.name}`}
              >
                <BookOpen size={14} />
              </button>
            )}
            {node.level < 5 && (
              <button
                onClick={() => onAddChild(node)}
                className="p-1.5 text-[#00A8A8] hover:bg-teal-50 rounded-lg transition"
                title={`إضافة حساب ابن تحت ${node.name}`}
              >
                <Plus size={14} />
              </button>
            )}
            <button
              onClick={() => onEdit(node)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="تعديل الحساب"
            >
              <Pencil size={14} />
            </button>
            {isDeletable ? (
              <button
                onClick={() => onDelete(node)}
                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title="حذف هذا الحساب الطرفي الفارغ"
              >
                <Trash2 size={14} />
              </button>
            ) : (
              <span
                className="p-1.5 text-slate-300 inline-flex items-center cursor-not-allowed"
                title={deleteTooltip}
              >
                <Lock size={13} className="text-slate-400" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* عرض الأبناء */}
      {isOpen && hasChildren && (
        <div className="bg-slate-50/40">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onViewLedger={onViewLedger}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const AccountsPage: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<AccountNode | null>(null);
  const [defaultParentNode, setDefaultParentNode] = useState<AccountNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<AccountNode | null>(null);
  const [ledgerAccount, setLedgerAccount] = useState<AccountNode | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  const handleViewLedger = (node: AccountNode) => {
    setLedgerAccount(node);
    setIsLedgerOpen(true);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const queryClient = useQueryClient();

  // الحصول على معرف الشركة المحفوظة
  const userJson = typeof window !== 'undefined' ? localStorage.getItem('dawacore_user') : null;
  const userObj = userJson ? JSON.parse(userJson) : null;
  const companyId = userObj?.companyId || '11111111-0000-0000-0000-000000000001';

  // جلب شجرة الحسابات
  const { data: tree = [], isLoading } = useQuery<AccountNode[]>({
    queryKey: ['accounts-tree', companyId],
    queryFn: () => accountsApi.getTree(companyId),
  });

  // حذف الحساب
  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-tree'] });
      setIsDeleteDialogOpen(false);
      setNodeToDelete(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'فشل حذف الحساب');
    },
  });

  // حساب الإجماليات حسب التصنيف الأساسي
  const summary = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let revenue = 0;
    let expenses = 0;

    for (const node of tree) {
      const bal = Number(node.totalBalance ?? node.balance ?? 0);
      if (node.type === 'ASSET') assets += bal;
      else if (node.type === 'LIABILITY') liabilities += bal;
      else if (node.type === 'EQUITY') equity += bal;
      else if (node.type === 'REVENUE') revenue += bal;
      else if (node.type === 'EXPENSE') expenses += bal;
    }

    return { assets, liabilities, equity, revenue, expenses };
  }, [tree]);

  // فلترة الشجرة
  const filteredTree = useMemo(() => {
    if (!searchTerm && typeFilter === 'ALL') return tree;

    const filterNode = (node: AccountNode): AccountNode | null => {
      const matchesSearch =
        !searchTerm ||
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.code.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = typeFilter === 'ALL' || node.type === typeFilter;

      const filteredChildren: AccountNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const res = filterNode(child);
          if (res) filteredChildren.push(res);
        }
      }

      if ((matchesSearch && matchesType) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };

    return tree.map(filterNode).filter(Boolean) as AccountNode[];
  }, [tree, searchTerm, typeFilter]);

  const handleOpenNewMain = () => {
    setSelectedNode(null);
    setDefaultParentNode(null);
    setIsModalOpen(true);
  };

  const handleAddChild = (parent: AccountNode) => {
    setSelectedNode(null);
    setDefaultParentNode(parent);
    setIsModalOpen(true);
  };

  const handleEdit = (node: AccountNode) => {
    setSelectedNode(node);
    setDefaultParentNode(null);
    setIsModalOpen(true);
  };

  const handleDelete = (node: AccountNode) => {
    if (node.level === 1 || !node.isLeaf) {
      alert(`لا يمكن حذف الحسابات الرئيسية والتجميعية (${node.name}) لحماية الهيكل المحاسبي العام.`);
      return;
    }
    if (node.children && node.children.length > 0) {
      alert(`لا يمكن حذف الحساب (${node.name}) لأنه يحتوي على حسابات فرعية تابعة له.`);
      return;
    }
    if (Math.abs(Number(node.balance || 0)) >= 0.001) {
      alert(`لا يمكن حذف الحساب (${node.name}) لأنه يحتوي على رصيد مالي قائم (${Number(node.balance).toLocaleString()} ج.س).`);
      return;
    }
    setNodeToDelete(node);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="شجرة الحسابات العامة (Chart of Accounts)"
        subtitle="دليل الحسابات الهرمي القياسي (5 مستويات) مع الحسابات التحليلية والتشغيلية"
        action={
          <button
            onClick={handleOpenNewMain}
            className="flex items-center gap-2 rounded-xl bg-[#582949] hover:bg-[#431f38] text-white px-4 py-2.5 text-xs font-bold shadow-md transition"
          >
            <Plus size={16} />
            <span>إضافة حساب رئيسي جديد</span>
          </button>
        }
      />

      {/* شريط الأمان المحاسبي والحماية */}
      <div className="flex items-center gap-3 p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs text-indigo-900">
        <ShieldCheck size={20} className="text-indigo-600 shrink-0" />
        <p className="leading-relaxed">
          <strong className="font-black text-indigo-950">قواعد الحماية المحاسبية الصارمة:</strong> يمنع النظام نهائياً حذف الحسابات الرئيسية والتجميعية، أو أي حساب مسجل عليه قيود أو أرصدة مالية قائمة، لضمان السلامة المحاسبية والامتثال لمعايير التدقيق المالي.
        </p>
      </div>

      {/* بطاقات الإجماليات الخمسة */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[11px] font-bold">إجمالي الأصول</span>
            <ArrowUpRight size={16} />
          </div>
          <p className="text-base font-black text-slate-800 font-mono">
            {summary.assets.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ج.س</span>
          </p>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-bold">إجمالي الخصوم</span>
            <TrendingDown size={16} />
          </div>
          <p className="text-base font-black text-slate-800 font-mono">
            {summary.liabilities.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ج.س</span>
          </p>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-1">
            <span className="text-[11px] font-bold">حقوق الملكية</span>
            <PieChart size={16} />
          </div>
          <p className="text-base font-black text-slate-800 font-mono">
            {summary.equity.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ج.س</span>
          </p>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-teal-600 mb-1">
            <span className="text-[11px] font-bold">الإيرادات</span>
            <TrendingUp size={16} />
          </div>
          <p className="text-base font-black text-slate-800 font-mono">
            {summary.revenue.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ج.س</span>
          </p>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-[11px] font-bold">المصروفات</span>
            <DollarSign size={16} />
          </div>
          <p className="text-base font-black text-slate-800 font-mono">
            {summary.expenses.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ج.س</span>
          </p>
        </div>
      </div>

      {/* شريط البحث والفلترة */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث برقم أو اسم الحساب..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-4 text-xs font-medium focus:border-[#00A8A8] focus:bg-white focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                typeFilter === t
                  ? 'bg-[#00A8A8] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t === 'ALL'
                ? 'الكل'
                : t === 'ASSET'
                ? 'الأصول'
                : t === 'LIABILITY'
                ? 'الخصوم'
                : t === 'EQUITY'
                ? 'حقوق الملكية'
                : t === 'REVENUE'
                ? 'الإيرادات'
                : 'المصروفات'}
            </button>
          ))}
        </div>
      </div>

      {/* هيكل الشجرة */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-600">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#00A8A8]" />
            <span>التسلسل الهرمي لشجرة الحسابات</span>
          </div>
          <div className="flex items-center gap-8 pl-4">
            <span>الرصيد</span>
            <span>العمليات</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-bold">
            جاري تحميل دليل الحسابات...
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-bold">
            لا توجد حسابات مطابقة لمعايير البحث
          </div>
        ) : (
          <div>
            {filteredTree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                onViewLedger={handleViewLedger}
                searchTerm={searchTerm}
              />
            ))}
          </div>
        )}
      </div>

      {/* نافذة الإضافة والتعديل */}
      <AccountFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        account={selectedNode}
        defaultParent={defaultParentNode}
        companyId={companyId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['accounts-tree'] })}
      />

      {/* نافذة كشف حساب الأستاذ العام والتصدير */}
      {ledgerAccount && (
        <AccountLedgerModal
          isOpen={isLedgerOpen}
          onClose={() => {
            setIsLedgerOpen(false);
            setLedgerAccount(null);
          }}
          accountId={ledgerAccount.id}
          accountCode={ledgerAccount.code}
          accountName={ledgerAccount.name}
        />
      )}

      {/* نافذة تأكيد الحذف */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setNodeToDelete(null);
        }}
        onConfirm={() => nodeToDelete && deleteMutation.mutate(nodeToDelete.id)}
        title="حذف حساب مالي"
        message={`هل أنت متأكد من رغبتك في حذف الحساب "${nodeToDelete?.name}" (${nodeToDelete?.code})؟`}
        confirmText="حذف الحساب"
        cancelText="إلغاء"
        variant="danger"
      />
    </div>
  );
};
