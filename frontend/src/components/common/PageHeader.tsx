import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 pb-4 mb-5 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-2xl font-black text-[#582949] leading-snug">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
  );
};
