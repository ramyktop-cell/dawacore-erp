import {
  BookOpen,
  FileText,
  Wallet,
  TrendingUp,
  BarChart3,
  Users,
  Building2,
  Package,
  AlertTriangle,
  ClipboardList,
  ArrowLeftRight,
  DollarSign,
  Receipt,
  ShoppingBag,
  Truck,
  Warehouse,
  Clock,
  ShieldCheck,
  Boxes,
} from 'lucide-react';

export type ReportCategory =
  | 'financial'
  | 'sales'
  | 'inventory'
  | 'partners'
  | 'operations';

export interface ReportConfig {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  path: string;
  icon: any;
  color: string;
  badge?: string;
  isNew?: boolean;
}

export const REPORT_CATEGORIES: Record<
  ReportCategory,
  { label: string; description: string; color: string; icon: any }
> = {
  financial: {
    label: 'التقارير المالية',
    description: 'الميزانية، الأرباح، الأستاذ، وميزان المراجعة',
    color: 'violet',
    icon: DollarSign,
  },
  sales: {
    label: 'تقارير المبيعات',
    description: 'المبيعات اليومية، الكاشيرين، وطرق الدفع',
    color: 'emerald',
    icon: ShoppingBag,
  },
  inventory: {
    label: 'تقارير المخزون',
    description: 'الأرصدة، الصلاحيات، الجرد، والحركات',
    color: 'amber',
    icon: Warehouse,
  },
  partners: {
    label: 'العملاء والموردون',
    description: 'كشوفات الحساب، الأعمار، والأرصدة',
    color: 'blue',
    icon: Users,
  },
  operations: {
    label: 'التقارير التشغيلية',
    description: 'الورديات، المصروفات، والتحويلات',
    color: 'rose',
    icon: Clock,
  },
};

export const REPORTS: ReportConfig[] = [
  // ============================================
  // التقارير المالية
  // ============================================
  {
    id: 'trial-balance',
    title: 'ميزان المراجعة',
    description: 'الأرصدة الافتتاحية والحركة والأرصدة الختامية لكل حساب',
    category: 'financial',
    path: '/reports/trial-balance',
    icon: BookOpen,
    color: 'violet',
  },
  {
    id: 'general-ledger',
    title: 'دفتر الأستاذ العام',
    description: 'كشف تفصيلي لحركة أي حساب مع الرصيد التراكمي',
    category: 'financial',
    path: '/reports/general-ledger',
    icon: FileText,
    color: 'violet',
  },
  {
    id: 'income-statement',
    title: 'قائمة الدخل',
    description: 'الإيرادات، تكلفة البضاعة المباعة، وصافي الربح',
    category: 'financial',
    path: '/reports/income-statement',
    icon: TrendingUp,
    color: 'violet',
  },
  {
    id: 'balance-sheet',
    title: 'الميزانية العمومية',
    description: 'المركز المالي: الأصول مقابل الخصوم وحقوق الملكية',
    category: 'financial',
    path: '/reports/balance-sheet',
    icon: BarChart3,
    color: 'violet',
    badge: 'جديد',
  },
  {
    id: 'cash-flow',
    title: 'التدفقات النقدية',
    description: 'حركة النقد الداخل والخارج من الأنشطة التشغيلية',
    category: 'financial',
    path: '/reports/cash-flow',
    icon: Wallet,
    color: 'violet',
  },
  {
    id: 'journal-entries',
    title: 'دفتر اليومية',
    description: 'سجل القيود المحاسبية مع تفاصيلها الكاملة',
    category: 'financial',
    path: '/accounting/ledger',
    icon: ClipboardList,
    color: 'violet',
  },

  // ============================================
  // تقارير المبيعات
  // ============================================
  {
    id: 'daily-sales',
    title: 'المبيعات اليومية والشاملة',
    description: 'مبيعات اليوم والفترات حسب الفرع والكاشير وطرق الدفع والمنتجات',
    category: 'sales',
    path: '/reports/daily-sales',
    icon: ShoppingBag,
    color: 'emerald',
    badge: 'جديد',
  },
  {
    id: 'sales-by-product',
    title: 'المبيعات حسب المنتج',
    description: 'تحليل الأدوية الأكثر مبيعاً وهامش الربح',
    category: 'sales',
    path: '/medicines',
    icon: Package,
    color: 'emerald',
  },
  {
    id: 'payment-methods',
    title: 'طرق الدفع',
    description: 'توزيع المبيعات بين النقدي والبنكي والآجل',
    category: 'sales',
    path: '/shifts',
    icon: DollarSign,
    color: 'emerald',
  },
  {
    id: 'cashier-performance',
    title: 'أداء الكاشيرين',
    description: 'إنتاجية كل كاشير وعدد الفواتير والمبيعات',
    category: 'sales',
    path: '/shifts',
    icon: Users,
    color: 'emerald',
  },
  {
    id: 'returns-report',
    title: 'المرتجعات',
    description: 'تحليل المرتجعات حسب السبب والمنتج',
    category: 'sales',
    path: '/returns',
    icon: Receipt,
    color: 'emerald',
  },

  // ============================================
  // تقارير المخزون
  // ============================================
  {
    id: 'price-list-by-company',
    title: 'قائمة الأسعار حسب الشركة (جملة وتجزئة)',
    description: 'طباعة قائمة الأسعار مجمعة حسب الشركة مع اسم الصنف، الوحدة، سعر الجملة، سعر التجزئة، والكمية',
    category: 'inventory',
    path: '/medicines?priceList=1',
    icon: ClipboardList,
    color: 'amber',
    badge: 'جديد',
    isNew: true,
  },
  {
    id: 'item-card',
    title: 'كرت الصنف / كارت حركة المخزن',
    description: 'تتبع حركة الصنف، الرصيد الافتتاحي، الوارد والمنصرف، وأطراف الحركة (العملاء والموردين)',
    category: 'inventory',
    path: '/reports/item-card',
    icon: Boxes,
    color: 'amber',
    badge: 'مهم',
  },
{
    id: 'inventory-valuation',
    title: 'تقييم المخازن وكشف الحركة',
    description: 'قيمة كل مخزن بسعر البيع وآخر سعر شراء وحركة الصنف التفصيلية',
    category: 'inventory',
    path: '/reports/branch-stock',
    icon: Boxes,
    color: 'amber',
  },
  {
    id: 'near-expiry',
    title: 'الأدوية قريبة الانتهاء',
    description: 'الدفعات التي تنتهي خلال 30/60/90 يوماً',
    category: 'inventory',
    path: '/batches',
    icon: AlertTriangle,
    color: 'amber',
    badge: 'هام',
  },
  {
    id: 'low-stock',
    title: 'المخزون المنخفض',
    description: 'الأدوية التي وصلت للحد الأدنى للطلب',
    category: 'inventory',
    path: '/medicines',
    icon: Package,
    color: 'amber',
  },
  {
    id: 'stock-movement',
    title: 'حركة الأصناف والرواكد',
    description: 'تحليل الاستهلاك اليومي، أيام التغطية، سرعة الدوران، والراكد',
    category: 'inventory',
    path: '/reports/stock-movement',
    icon: ArrowLeftRight,
    color: 'amber',
    badge: 'جديد',
  },
  {
    id: 'batches-report',
    title: 'الدفعات والتشغيلات',
    description: 'عرض جميع الدفعات مع تواريخ الصلاحية',
    category: 'inventory',
    path: '/batches',
    icon: Package,
    color: 'amber',
  },
  {
    id: 'stock-counts',
    title: 'محاضر الجرد',
    description: 'دورات الجرد الدوري والفروقات',
    category: 'inventory',
    path: '/stock-count',
    icon: ClipboardList,
    color: 'amber',
  },

  // ============================================
  // العملاء والموردون
  // ============================================
  {
    id: 'customers-aging',
    title: 'أعمار ديون العملاء',
    description: 'تصنيف المديونيات حسب الفترة (30/60/90+)',
    category: 'partners',
    path: '/reports/customers-aging',
    icon: Clock,
    color: 'blue',
    badge: 'جديد',
  },
  {
    id: 'suppliers-aging',
    title: 'أعمار ديون الموردين',
    description: 'المستحقات للموردين حسب تاريخ الاستحقاق',
    category: 'partners',
    path: '/reports/suppliers-aging',
    icon: Truck,
    color: 'blue',
    badge: 'جديد',
  },
  {
    id: 'customers-balances',
    title: 'أرصدة العملاء',
    description: 'قائمة شاملة بأرصدة ومديونيات العملاء',
    category: 'partners',
    path: '/customers',
    icon: Users,
    color: 'blue',
  },
  {
    id: 'suppliers-balances',
    title: 'أرصدة الموردين',
    description: 'قائمة بأرصدة ومستحقات الموردين',
    category: 'partners',
    path: '/suppliers',
    icon: Building2,
    color: 'blue',
  },

  // ============================================
  // التقارير التشغيلية
  // ============================================
  {
    id: 'shifts-report',
    title: 'الورديات',
    description: 'فتح وإغلاق الورديات مع الفروقات النقدية',
    category: 'operations',
    path: '/shifts',
    icon: Clock,
    color: 'rose',
  },
  {
    id: 'expenses-report',
    title: 'المصروفات',
    description: 'تحليل المصروفات حسب النوع والفرع',
    category: 'operations',
    path: '/expenses',
    icon: Receipt,
    color: 'rose',
  },
  {
    id: 'transfers-report',
    title: 'التحويلات المخزنية',
    description: 'التحويلات بين الفروع وحالتها',
    category: 'operations',
    path: '/transfers',
    icon: ArrowLeftRight,
    color: 'rose',
  },
  {
    id: 'audit-log',
    title: 'سجل التدقيق',
    description: 'تتبع جميع العمليات الحساسة في النظام',
    category: 'operations',
    path: '/dashboard',
    icon: ShieldCheck,
    color: 'rose',
  },
];
