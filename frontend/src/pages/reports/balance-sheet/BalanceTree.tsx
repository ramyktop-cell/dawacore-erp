import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { BalanceSheetItem } from '../../../api/balance-sheet';

interface Props {
  items: BalanceSheetItem[];
  depth?: number;
  side: 'asset' | 'liability' | 'equity';
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '-';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const BalanceTree: React.FC<Props> = ({ items, depth = 0, side }) => {
  return (
    <>
      {items.map((item) => (
        <TreeNode key={item.accountId} item={item} depth={depth} side={side} />
      ))}
    </>
  );
};

const TreeNode: React.FC<{
  item: BalanceSheetItem;
  depth: number;
  side: 'asset' | 'liability' | 'equity';
}> = ({ item, depth, side }) => {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const hasChildren = item.children && item.children.length > 0;
  const isNegative =
    (side === 'asset' && item.balance < 0) ||
    (side === 'liability' && item.balance < 0) ||
    (side === 'equity' && item.balance < 0);

  const paddingRight = depth * 20;

  return (
    <>
      <tr
        className={`hover:bg-slate-50 transition-colors ${
          item.isSynthetic ? 'bg-emerald-50/40 font-semibold' : ''
        }`}
      >
        <td
          className="py-2 px-3 text-right"
          style={{ paddingRight: `${paddingRight + 12}px` }}
        >
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-slate-400 hover:text-slate-600"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-[14px]" />
            )}

            {hasChildren ? (
              <Folder size={14} className="text-amber-500" />
            ) : (
              <FileText
                size={14}
                className={item.isSynthetic ? 'text-emerald-600' : 'text-blue-500'}
              />
            )}

            <span className="text-xs font-mono text-slate-500">
              {item.accountCode}
            </span>
            <span className={`text-sm ${item.isSynthetic ? 'text-emerald-800' : 'text-slate-800'}`}>
              {item.accountName}
            </span>

            {item.isSynthetic && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                محسوب
              </span>
            )}
          </div>
        </td>

        <td
          className={`py-2 px-4 text-left font-mono text-sm ${
            isNegative ? 'text-rose-600' : 'text-slate-800'
          }`}
        >
          {fmt(item.balance)}
        </td>
      </tr>

      {hasChildren && isOpen && (
        <BalanceTree items={item.children!} depth={depth + 1} side={side} />
      )}
    </>
  );
};
