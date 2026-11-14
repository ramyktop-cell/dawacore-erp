import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import {
  REPORT_CATEGORIES,
  REPORTS,
  ReportCategory,
} from './reports-config';
import { Search, ChevronLeft, Sparkles } from 'lucide-react';

export const ReportsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'all'>(
    'all',
  );

  // فلترة التقارير
  const filteredReports = useMemo(() => {
    let reports = REPORTS;

    if (activeCategory !== 'all') {
      reports = reports.filter((r) => r.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      reports = reports.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query),
      );
    }

    return reports;
  }, [activeCategory, searchQuery]);

  // تجميع حسب الفئة
  const groupedReports = useMemo(() => {
    const groups: Record<ReportCategory, typeof REPORTS> = {
      financial: [],
      sales: [],
      inventory: [],
      partners: [],
      operations: [],
    };

    for (const report of filteredReports) {
      groups[report.category].push(report);
    }

    return groups;
  }, [filteredReports]);

  const totalReports = REPORTS.length;

  return (
    <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
      <PageHeader
        title="مركز التقارير"
        subtitle={`${totalReports} تقرير متاح — مصنّف حسب الوحدة`}
      />

      {/* Hero Section */}
      <div className="mt-6 bg-gradient-to-l from-violet-600 via-violet-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles size={24} />
          <h2 className="text-2xl font-black">نظرة شاملة على أداء منشأتك</h2>
        </div>
        <p className="text-violet-100 text-sm max-w-2xl">
          اختر التقرير المناسب من التصنيفات أدناه. جميع التقارير تدعم التصدير
          إلى PDF و Excel والطباعة المباشرة.
        </p>

        {/* شريط البحث */}
        <div className="mt-5 relative max-w-2xl">
          <Search
            size={18}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="ابحث في التقارير... (مثال: ميزانية، مخزون، عملاء)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border-0 pr-12 pl-4 py-3 text-slate-800 text-sm focus:ring-4 focus:ring-white/30 focus:outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* تبويبات التصنيفات */}
      <div className="mt-6 flex flex-wrap gap-2">
        <CategoryTab
          label="الكل"
          count={REPORTS.length}
          isActive={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
          color="slate"
        />
        {(Object.keys(REPORT_CATEGORIES) as ReportCategory[]).map((cat) => {
          const config = REPORT_CATEGORIES[cat];
          const count = REPORTS.filter((r) => r.category === cat).length;
          return (
            <CategoryTab
              key={cat}
              label={config.label}
              count={count}
              isActive={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              color={config.color}
              icon={<config.icon size={14} />}
            />
          );
        })}
      </div>

      {/* التقارير المجمّعة حسب الفئة */}
      <div className="mt-6 space-y-8">
        {filteredReports.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Search size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              لا توجد تقارير مطابقة للبحث
            </p>
            <p className="text-xs text-slate-400 mt-1">
              جرّب كلمات بحث مختلفة أو اختر تصنيفاً آخر
            </p>
          </div>
        ) : (
          (Object.keys(groupedReports) as ReportCategory[]).map((cat) => {
            const categoryReports = groupedReports[cat];
            if (categoryReports.length === 0) return null;

            const config = REPORT_CATEGORIES[cat];

            return (
              <div key={cat}>
                {/* عنوان الفئة */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`p-2 rounded-lg bg-${config.color}-50 border border-${config.color}-200`}
                  >
                    <config.icon
                      size={18}
                      className={`text-${config.color}-600`}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {config.label}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {config.description}
                    </p>
                  </div>
                  <span className="mr-auto text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {categoryReports.length} تقرير
                  </span>
                </div>

                {/* شبكة التقارير */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      onClick={() => navigate(report.path)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================
// بطاقة تصنيف
// ============================================
const CategoryTab: React.FC<{
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  color: string;
  icon?: React.ReactNode;
}> = ({ label, count, isActive, onClick, color, icon }) => {
  const colorMap: Record<string, { active: string; hover: string }> = {
    violet: {
      active: 'bg-violet-600 text-white border-violet-600',
      hover: 'hover:border-violet-300',
    },
    emerald: {
      active: 'bg-emerald-600 text-white border-emerald-600',
      hover: 'hover:border-emerald-300',
    },
    amber: {
      active: 'bg-amber-600 text-white border-amber-600',
      hover: 'hover:border-amber-300',
    },
    blue: {
      active: 'bg-blue-600 text-white border-blue-600',
      hover: 'hover:border-blue-300',
    },
    rose: {
      active: 'bg-rose-600 text-white border-rose-600',
      hover: 'hover:border-rose-300',
    },
    slate: {
      active: 'bg-slate-700 text-white border-slate-700',
      hover: 'hover:border-slate-400',
    },
  };

  const style = colorMap[color] || colorMap.slate;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
        isActive
          ? style.active
          : `bg-white text-slate-700 border-slate-200 ${style.hover}`
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
};

// ============================================
// بطاقة تقرير
// ============================================
const ReportCard: React.FC<{
  report: any;
  onClick: () => void;
}> = ({ report, onClick }) => {
  const Icon = report.icon;

  const colorStyles: Record<
    string,
    {
      bg: string;
      border: string;
      hoverBorder: string;
      iconBg: string;
      iconBorder: string;
      iconText: string;
      badgeBg: string;
      badgeText: string;
      actionText: string;
    }
  > = {
    violet: {
      bg: 'bg-white',
      border: 'border-slate-200',
      hoverBorder: 'hover:border-violet-300',
      iconBg: 'bg-violet-50',
      iconBorder: 'border-violet-100',
      iconText: 'text-violet-600',
      badgeBg: 'bg-violet-100',
      badgeText: 'text-violet-700',
      actionText: 'text-violet-600',
    },
    emerald: {
      bg: 'bg-white',
      border: 'border-slate-200',
      hoverBorder: 'hover:border-emerald-300',
      iconBg: 'bg-emerald-50',
      iconBorder: 'border-emerald-100',
      iconText: 'text-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
      actionText: 'text-emerald-600',
    },
    amber: {
      bg: 'bg-white',
      border: 'border-slate-200',
      hoverBorder: 'hover:border-amber-300',
      iconBg: 'bg-amber-50',
      iconBorder: 'border-amber-100',
      iconText: 'text-amber-600',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-700',
      actionText: 'text-amber-600',
    },
    blue: {
      bg: 'bg-white',
      border: 'border-slate-200',
      hoverBorder: 'hover:border-blue-300',
      iconBg: 'bg-blue-50',
      iconBorder: 'border-blue-100',
      iconText: 'text-blue-600',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
      actionText: 'text-blue-600',
    },
    rose: {
      bg: 'bg-white',
      border: 'border-slate-200',
      hoverBorder: 'hover:border-rose-300',
      iconBg: 'bg-rose-50',
      iconBorder: 'border-rose-100',
      iconText: 'text-rose-600',
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-700',
      actionText: 'text-rose-600',
    },
  };

  const style = colorStyles[report.color] || colorStyles.violet;

  return (
    <button
      onClick={onClick}
      className={`group relative bg-white rounded-xl border ${style.border} p-4 text-right hover:shadow-md ${style.hoverBorder} hover:-translate-y-0.5 transition-all`}
    >
      {/* شارة (اختياري) */}
      {report.badge && (
        <span
          className={`absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badgeBg} ${style.badgeText}`}
        >
          {report.badge}
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* الأيقونة */}
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-xl ${style.iconBg} border ${style.iconBorder} flex items-center justify-center group-hover:scale-105 transition-transform`}
        >
          <Icon size={20} className={style.iconText} />
        </div>

        {/* النص */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-slate-900">
            {report.title}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {report.description}
          </p>
        </div>
      </div>

      {/* سهم الفتح */}
      <div className="mt-3 flex justify-end">
        <div
          className={`flex items-center gap-1 text-xs font-bold ${style.actionText} opacity-0 group-hover:opacity-100 transition-opacity`}
        >
          <span>فتح التقرير</span>
          <ChevronLeft size={14} />
        </div>
      </div>
    </button>
  );
};
