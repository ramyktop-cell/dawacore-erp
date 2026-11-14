import React from 'react';
import { MovementSummary } from '../../../api/stock-movement';
import { Flame, Clock, AlertTriangle, Skull, Layers } from 'lucide-react';

interface MovementClassTabProps {
  currentTab: string;
  onTabChange: (tab: 'all' | 'fast' | 'normal' | 'slow' | 'dead') => void;
  summary?: MovementSummary;
}

export const MovementClassTab: React.FC<MovementClassTabProps> = ({
  currentTab,
  onTabChange,
  summary,
}) => {
  const tabs = [
    {
      id: 'all',
      label: 'كل الأصناف',
      count: summary?.totalMedicines || 0,
      icon: Layers,
      color: 'text-slate-700 dark:text-slate-200',
      activeBg: 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm',
    },
    {
      id: 'fast',
      label: 'سريعة الحركة',
      count: summary?.fastMovingCount || 0,
      icon: Flame,
      color: 'text-emerald-600 dark:text-emerald-400',
      activeBg: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'normal',
      label: 'طبيعية الحركة',
      count: summary?.normalMovingCount || 0,
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      activeBg: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-sm border-blue-200 dark:border-blue-800',
    },
    {
      id: 'slow',
      label: 'بطيئة الحركة',
      count: summary?.slowMovingCount || 0,
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      activeBg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 shadow-sm border-amber-200 dark:border-amber-800',
    },
    {
      id: 'dead',
      label: 'أصناف راكدة',
      count: summary?.deadStockCount || 0,
      icon: Skull,
      color: 'text-rose-600 dark:text-rose-400',
      activeBg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 shadow-sm border-rose-200 dark:border-rose-800',
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 border border-transparent ${
              isActive
                ? tab.activeBg
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/40'
            }`}
          >
            <Icon className={`w-4 h-4 ${tab.color}`} />
            <span>{tab.label}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                isActive
                  ? 'bg-white/80 dark:bg-slate-900/80 text-current'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
