import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, Shift, ShiftStatus } from '../api/shifts';
import { branchesApi } from '../api/branches';
import { ThermalPrinterService } from '../services/printer.service';
import { getCurrentUser } from '../utils/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import {
  Clock,
  DollarSign,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  User,
  Building2,
  Calendar,
  X,
  FileText,
  Printer,
  Calculator,
} from 'lucide-react';

export const ShiftsPage: React.FC = () => {
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('');
  const [page, setPage] = useState(1);

  // Modals
  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [isCloseShiftModal, setIsCloseShiftModal] = useState(false);
  const [isApproveShiftModal, setIsApproveShiftModal] = useState(false);
  const [isCashMovementModal, setIsCashMovementModal] = useState(false);
  const [isDetailsModal, setIsDetailsModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  // Form states
  const [openShiftBranchId, setOpenShiftBranchId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const [approveNotes, setApproveNotes] = useState('');

  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  // 🧮 حاسبة فئات النقدية (Cash Denominations) للجرد الأعمى
  const [showDenominations, setShowDenominations] = useState(false);
  const [denominations, setDenominations] = useState<{ [denom: number]: number }>({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
  });
  const [otherCash, setOtherCash] = useState<string>('');

  const calculateDenominationsTotal = () => {
    let total = 0;
    Object.entries(denominations).forEach(([denom, count]) => {
      total += Number(denom) * (Number(count) || 0);
    });
    total += Number(otherCash) || 0;
    return total;
  };

  const applyDenominationsTotal = () => {
    const total = calculateDenominationsTotal();
    setActualCash(String(total));
  };

  const handlePrintZReport = (shift: any) => {
    if (!shift) return;
    ThermalPrinterService.printShiftReport({
      companyName: 'مجموعة صيدليات وسوبر ماركت DawaCore',
      branchName: shift.branch?.name || 'الفرع الرئيسي',
      shiftNumber: shift.shiftNumber,
      cashierName: shift.user?.name || shift.user?.username || 'الكاشير',
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      approvedBy: shift.approvedBy,
      openingBalance: Number(shift.openingBalance || 0),
      totalSalesCash: Number(shift.totalSalesCash || 0),
      totalSalesBank: Number(shift.totalSalesBank || 0),
      totalSalesCredit: Number(shift.totalSalesCredit || 0),
      totalSales: Number(shift.totalSales || 0),
      totalCashIn: shift.cashMovements
        ?.filter((m: any) => m.type === 'CASH_IN')
        .reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0),
      totalCashOut: shift.cashMovements
        ?.filter((m: any) => m.type === 'CASH_OUT')
        .reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0),
      expectedCash: Number(shift.expectedCash || 0),
      actualCash: Number(shift.actualCash || 0),
      cashDifference: Number(shift.cashDifference || 0),
      invoicesCount: shift._count?.invoices ?? shift.invoices?.length,
      notes: shift.notes,
    });
  };


  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
  });

  const branches = branchesData?.items || [];
  const defaultBranchId = selectedBranchId || (branches.length > 0 ? branches[0].id : '');

  // Active shift query
  const { data: activeShift, refetch: refetchActive } = useQuery({
    queryKey: ['active-shift', defaultBranchId],
    queryFn: () => (defaultBranchId ? shiftsApi.getActive(defaultBranchId) : Promise.resolve(null)),
    enabled: !!defaultBranchId,
  });

  // Shifts list query
  const { data: shiftsData, isLoading } = useQuery({
    queryKey: ['shifts', { branchId: selectedBranchId, status: statusFilter, page }],
    queryFn: () =>
      shiftsApi.getAll({
        branchId: selectedBranchId || undefined,
        status: (statusFilter as ShiftStatus) || undefined,
        page,
        limit: 10,
      }),
  });

  // Selected shift details query
  const { data: shiftDetails } = useQuery({
    queryKey: ['shift-details', selectedShift?.id],
    queryFn: () => (selectedShift ? shiftsApi.getOne(selectedShift.id) : null),
    enabled: !!selectedShift && isDetailsModal,
  });

  // Mutations
  const openShiftMutation = useMutation({
    mutationFn: shiftsApi.open,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      setIsOpenShiftModal(false);
      setOpeningBalance('');
      alert('تم فتح الوردية بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل فتح الوردية');
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { actualCash: number; notes?: string } }) =>
      shiftsApi.close(id, data),
    onSuccess: (updatedShift: any) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      setIsCloseShiftModal(false);
      setActualCash('');
      setCloseNotes('');
      setShowDenominations(false);
      const shouldPrint = window.confirm(
        '✅ تم إغلاق الوردية وحساب الفروقات بنجاح!\n\nهل ترغب في طباعة إيصال تقفيل الوردية الحراري (Z-Report) الآن؟'
      );
      if (shouldPrint && updatedShift) {
        handlePrintZReport(updatedShift);
      }
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل إغلاق الوردية');
    },
  });

  const approveShiftMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { approvedBy: string; notes?: string } }) =>
      shiftsApi.approve(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setIsApproveShiftModal(false);
      setApproveNotes('');
      alert('تم اعتماد الوردية وتسوية الفروقات بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل اعتماد الوردية');
    },
  });

  const cashMovementMutation = useMutation({
    mutationFn: shiftsApi.recordCashMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      setIsCashMovementModal(false);
      setMovementAmount('');
      setMovementReason('');
      alert('تم تسجيل حركة الصندوق وتحديث الرصيد بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل تسجيل حركة الصندوق');
    },
  });

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const branch = openShiftBranchId || defaultBranchId;
    const user = currentUser?.id || '';
    if (!branch || !user) {
      alert('يرجى تحديد الفرع والمستخدم');
      return;
    }
    openShiftMutation.mutate({
      branchId: branch,
      userId: user,
      openingBalance: parseFloat(openingBalance) || 0,
    });
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const shiftId = selectedShift?.id || activeShift?.id;
    if (!shiftId) return;
    closeShiftMutation.mutate({
      id: shiftId,
      data: {
        actualCash: parseFloat(actualCash) || 0,
        notes: closeNotes,
      },
    });
  };

  const handleApproveShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift) return;
    const supervisorId = currentUser?.id;
    if (!supervisorId) return;
    approveShiftMutation.mutate({
      id: selectedShift.id,
      data: {
        approvedBy: supervisorId,
        notes: approveNotes,
      },
    });
  };

  const handleCashMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const shiftId = activeShift?.id || selectedShift?.id;
    if (!shiftId) return;
    const supervisorId = currentUser?.id;
    if (!supervisorId) return;
    cashMovementMutation.mutate({
      shiftId,
      type: movementType,
      amount: parseFloat(movementAmount) || 0,
      reason: movementReason,
      authorizedBy: supervisorId,
    });
  };

  const getStatusBadge = (status: ShiftStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            وردية مفتوحة
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Lock className="w-3.5 h-3.5" />
            بانتظار الاعتماد
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            معتمدة ومطابقة
          </span>
        );
    }
  };

  const columns = [
    {
      header: 'رقم الوردية',
      accessor: (item: Shift) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center font-bold text-teal-800 text-sm">
            #{item.shiftNumber}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-xs">{item.branch?.name}</p>
            <p className="text-[11px] text-slate-400">
              {new Date(item.openedAt).toLocaleDateString('ar-SD', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'الكاشير المسؤول',
      accessor: (item: Shift) => (
        <div className="flex items-center gap-1.5">
          <User className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-800 text-xs">{item.user?.name || item.user?.username}</span>
        </div>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: Shift) => getStatusBadge(item.status),
    },
    {
      header: 'العهدة الافتتاحية',
      accessor: (item: Shift) => (
        <span className="font-mono text-xs font-bold text-slate-700">
          {Number(item.openingBalance).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'إجمالي المبيعات',
      accessor: (item: Shift) => (
        <div className="text-xs">
          <span className="font-bold font-mono text-emerald-700">
            {Number(item.totalSales).toLocaleString()} ج.س
          </span>
          <div className="text-[10px] text-slate-400 flex gap-2">
            <span>نقداً: {Number(item.totalSalesCash).toLocaleString()}</span>
            <span>بنك: {Number(item.totalSalesBank).toLocaleString()}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'النقد المتوقع',
      accessor: (item: Shift) => (
        <span className="font-mono text-xs font-bold text-slate-900">
          {Number(item.expectedCash).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'النقد الفعلي / الفارق',
      accessor: (item: Shift) => {
        if (item.status === 'OPEN') {
          return <span className="text-xs text-slate-400 italic">قيد التشغيل...</span>;
        }
        const diff = Number(item.cashDifference || 0);
        return (
          <div className="text-xs">
            <p className="font-mono font-bold text-slate-800">
              {Number(item.actualCash || 0).toLocaleString()} ج.س
            </p>
            {diff === 0 ? (
              <span className="text-[11px] text-emerald-600 font-semibold">مطابق تماماً (0)</span>
            ) : diff > 0 ? (
              <span className="text-[11px] text-teal-600 font-bold">فائض: +{diff.toLocaleString()} ج.س</span>
            ) : (
              <span className="text-[11px] text-rose-600 font-bold">عجز: {diff.toLocaleString()} ج.س</span>
            )}
          </div>
        );
      },
    },
    {
      header: 'الإجراءات',
      accessor: (item: Shift) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setSelectedShift(item);
              setIsDetailsModal(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            التفاصيل
          </button>
          {item.status !== 'OPEN' && (
            <button
              onClick={() => handlePrintZReport(item)}
              title="طباعة إيصال تقفيل الوردية الحراري (Z-Report)"
              className="px-2 py-1 text-xs font-bold rounded bg-slate-800 hover:bg-black text-amber-300 transition flex items-center gap-1 shadow-2xs"
            >
              <Printer className="w-3 h-3 text-amber-400" />
              <span>Z-Report</span>
            </button>
          )}
          {item.status === 'OPEN' && (
            <button
              onClick={() => {
                setSelectedShift(item);
                setActualCash('');
                setShowDenominations(false);
                setIsCloseShiftModal(true);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-600 text-white transition flex items-center gap-1"
            >
              <Lock className="w-3 h-3" />
              إغلاق
            </button>
          )}
          {item.status === 'CLOSED' && (
            <button
              onClick={() => {
                setSelectedShift(item);
                setIsApproveShiftModal(true);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white transition flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              اعتماد
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="إدارة الورديات والصندوق (Shifts & Cash)"
        subtitle="مراقبة عهد الكاشيرات، فتح وإغلاق الورديات، تسجيل الحركات النقدية ومطابقة فروقات الصندوق"
        action={
          <div className="flex items-center gap-2">
            {!activeShift && (
              <button
                onClick={() => {
                  setOpenShiftBranchId(defaultBranchId);
                  setIsOpenShiftModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4" />
                فتح وردية جديدة
              </button>
            )}
            {activeShift && (
              <>
                <button
                  onClick={() => setIsCashMovementModal(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-300 transition"
                >
                  <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                  حركة صندوق (سحب/إيداع)
                </button>
                <button
                  onClick={() => {
                    setSelectedShift(activeShift);
                    setActualCash('');
                    setShowDenominations(false);
                    setIsCloseShiftModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm shadow-sm transition"
                >
                  <Lock className="w-4 h-4" />
                  إغلاق الوردية الحالية
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Active Shift Banner */}
      {activeShift ? (
        <div className="bg-gradient-to-r from-teal-900 to-[#582949] rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                <Clock className="w-6 h-6 text-teal-300 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    وردية نشطة #{activeShift.shiftNumber}
                  </span>
                  <span className="text-white/80 text-xs">
                    {activeShift.branch?.name} ({activeShift.user?.name})
                  </span>
                </div>
                <h3 className="text-lg font-black mt-1">
                  بدأت في: {new Date(activeShift.openedAt).toLocaleTimeString('ar-SD', { hour: '2-digit', minute: '2-digit' })}
                </h3>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white/5 p-3 rounded-lg border border-white/10">
              <div>
                <span className="text-[11px] text-white/60 block">العهدة الافتتاحية</span>
                <span className="font-mono font-bold text-sm text-teal-200">
                  {Number(activeShift.openingBalance).toLocaleString()} ج.س
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/60 block">مبيعات نقدية</span>
                <span className="font-mono font-bold text-sm text-emerald-300">
                  {Number(activeShift.totalSalesCash).toLocaleString()} ج.س
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/60 block">مبيعات بنكية / بطاقة</span>
                <span className="font-mono font-bold text-sm text-cyan-300">
                  {Number(activeShift.totalSalesBank).toLocaleString()} ج.س
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/60 block">النقد المتوقع بالدرج</span>
                <span className="font-mono font-black text-base text-yellow-300">
                  {Number(activeShift.expectedCash).toLocaleString()} ج.س
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-amber-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-bold text-sm">لا توجد وردية مفتوحة حالياً في الفرع المختار</p>
              <p className="text-xs text-amber-700">
                يجب فتح وردية جديدة للبدء في إصدار فواتير المبيعات وحركات الصندوق.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setOpenShiftBranchId(defaultBranchId);
              setIsOpenShiftModal(true);
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-sm transition"
          >
            فتح وردية الآن
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">تصفية حسب الفرع</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[180px]"
            >
              <option value="">جميع الفروع</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">حالة الوردية</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ShiftStatus | '')}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[150px]"
            >
              <option value="">جميع الحالات</option>
              <option value="OPEN">مفتوحة (OPEN)</option>
              <option value="CLOSED">مغلقة بانتظار الاعتماد (CLOSED)</option>
              <option value="APPROVED">معتمدة (APPROVED)</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          إجمالي الورديات المسجلة: <strong className="text-slate-800">{shiftsData?.total || 0}</strong>
        </div>
      </div>

      {/* Shifts Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataTable<Shift>
          columns={columns}
          data={shiftsData?.items || []}
          isLoading={isLoading}
        />
      </div>

      {/* ================= MODAL: Open Shift ================= */}
      {isOpenShiftModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-teal-600" />
                فتح وردية جديدة
              </h3>
              <button onClick={() => setIsOpenShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الفرع *</label>
                <select
                  value={openShiftBranchId}
                  onChange={(e) => setOpenShiftBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {branches.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكاشير المسؤول *</label>
                <input
                  value={currentUser?.name || currentUser?.username || 'المستخدم الحالي'}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الرصيد الافتتاحي (العهدة النقدية في الدرج) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 pr-3 pl-12"
                    required
                  />
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">ج.س</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpenShiftModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={openShiftMutation.isPending}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {openShiftMutation.isPending ? 'جاري الفتح...' : 'تأكيد فتح الوردية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: Close Shift (Blind Close + Denominations) ================= */}
      {isCloseShiftModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-600" />
                  إغلاق الوردية ومطابقة الصندوق (Blind Shift Close)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  الوردية #{selectedShift?.shiftNumber} • الكاشير: {selectedShift?.user?.name || 'الكاشير'}
                </p>
              </div>
              <button onClick={() => setIsCloseShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Blind Close Security Notice */}
            <div className="p-3 bg-amber-50 border border-amber-300/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5 font-bold">جرد أعمى لحماية نزاهة الصندوق:</strong>
                المبلغ المتوقع محجوب تماماً لضمان عدّ النقدية بأمانة تامة. قم بعدّ النقدية الفعلية في الدرج وسيقوم النظام باحتساب الفارق (عجز أو فائض) فور التأكيد.
              </div>
            </div>

            {/* Collapsible Denominations Counter */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              <button
                type="button"
                onClick={() => setShowDenominations(!showDenominations)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-teal-800">
                  <Calculator className="w-4 h-4 text-teal-600" />
                  حاسبة فئات النقدية (عد الأوراق النقدية والقطع)
                </span>
                <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded-full">
                  {showDenominations ? 'إخفاء الحاسبة ⬆️' : 'فتح الحاسبة ⬇️'}
                </span>
              </button>

              {showDenominations && (
                <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    {[1000, 500, 200, 100, 50].map((denom) => (
                      <div key={denom} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">{denom} ج.س</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={denominations[denom] || ''}
                            onChange={(e) =>
                              setDenominations({
                                ...denominations,
                                [denom]: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-16 px-1.5 py-1 text-center font-mono font-bold border border-slate-300 rounded bg-white"
                          />
                          <span className="text-[10px] text-slate-500 font-mono w-14 text-left">
                            = {((denominations[denom] || 0) * denom).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800">فئات أخرى / فكة:</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={otherCash}
                        onChange={(e) => setOtherCash(e.target.value)}
                        className="w-24 px-1.5 py-1 text-center font-mono font-bold border border-slate-300 rounded bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-xs">
                      <span className="text-slate-500">مجموع الفئات: </span>
                      <strong className="text-sm font-mono text-teal-700">
                        {calculateDenominationsTotal().toLocaleString()} ج.س
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={applyDenominationsTotal}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      اعتماد هذا المجموع في النقد الفعلي ⬅️
                    </button>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ النقدي الفعلي في الدرج (Actual Cash) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    placeholder="أدخل المبلغ الإجمالي بعد العدّ..."
                    className="w-full px-3 py-2.5 border-2 border-amber-300 rounded-xl text-base font-mono font-black text-slate-900 focus:border-amber-600 focus:outline-none pr-3 pl-12 bg-amber-50/20"
                    required
                    autoFocus
                  />
                  <span className="absolute left-3 top-3 text-xs font-black text-amber-700">ج.س</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الإغلاق (اختياري)</label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  placeholder="أي ملاحظات حول الجرد أو الصندوق..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCloseShiftModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={closeShiftMutation.isPending || actualCash === ''}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer"
                >
                  {closeShiftMutation.isPending ? 'جاري الإغلاق والمطابقة...' : 'تأكيد وإغلاق الوردية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: Cash Movement ================= */}
      {isCashMovementModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-teal-600" />
                حركة نقدية في الصندوق (سند قبض / صرف)
              </h3>
              <button onClick={() => setIsCashMovementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCashMovement} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الحركة *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMovementType('CASH_OUT')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      movementType === 'CASH_OUT'
                        ? 'bg-rose-50 border-rose-400 text-rose-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-rose-600" />
                    صرف / سحب نقدية
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('CASH_IN')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      movementType === 'CASH_IN'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    إيداع / تغذية الصندوق
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-teal-500 pr-3 pl-12"
                    required
                  />
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">ج.س</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">السبب / البيان *</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="مثال: شراء أدوات نظافة، تغذية خردة، إلخ..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCashMovementModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={cashMovementMutation.isPending}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {cashMovementMutation.isPending ? 'جاري التسجيل...' : 'تسجيل الحركة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: Approve Shift ================= */}
      {isApproveShiftModal && selectedShift && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
                اعتماد الوردية وتسوية الفروقات
              </h3>
              <button onClick={() => setIsApproveShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">رقم الوردية:</span>
                <span className="font-bold">#{selectedShift.shiftNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">النقد المتوقع:</span>
                <span className="font-mono font-bold">{Number(selectedShift.expectedCash).toLocaleString()} ج.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">النقد الفعلي:</span>
                <span className="font-mono font-bold">{Number(selectedShift.actualCash || 0).toLocaleString()} ج.س</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-bold">الفارق:</span>
                <span className="font-mono font-black">
                  {Number(selectedShift.cashDifference || 0).toLocaleString()} ج.س
                </span>
              </div>
            </div>

            <form onSubmit={handleApproveShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الاعتماد (اختياري)</label>
                <textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات المشرف على الفروقات أو التسوية..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsApproveShiftModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={approveShiftMutation.isPending}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {approveShiftMutation.isPending ? 'جاري الاعتماد...' : 'اعتماد وترحيل الوردية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: Shift Details ================= */}
      {isDetailsModal && shiftDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center font-bold text-teal-800">
                  #{shiftDetails.shiftNumber}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    تفاصيل الوردية - {shiftDetails.branch?.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    الكاشير: {shiftDetails.user?.name} | {new Date(shiftDetails.openedAt).toLocaleString('ar-SD')}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500">العهدة الافتتاحية</span>
                <p className="font-mono font-bold text-sm text-slate-800 mt-1">
                  {Number(shiftDetails.openingBalance).toLocaleString()} ج.س
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <span className="text-[11px] text-emerald-600">إجمالي المبيعات</span>
                <p className="font-mono font-bold text-sm text-emerald-800 mt-1">
                  {Number(shiftDetails.totalSales).toLocaleString()} ج.س
                </p>
              </div>
              <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 text-center">
                <span className="text-[11px] text-teal-600">النقد المتوقع</span>
                <p className="font-mono font-bold text-sm text-teal-800 mt-1">
                  {Number(shiftDetails.expectedCash).toLocaleString()} ج.س
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <span className="text-[11px] text-blue-600">النقد الفعلي</span>
                <p className="font-mono font-bold text-sm text-blue-800 mt-1">
                  {Number(shiftDetails.actualCash || 0).toLocaleString()} ج.س
                </p>
              </div>
            </div>

            {/* Cash Movements */}
            <div>
              <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-teal-600" />
                حركات الصندوق أثناء الوردية ({shiftDetails.cashMovements?.length || 0})
              </h4>
              {shiftDetails.cashMovements && shiftDetails.cashMovements.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-2 text-right">النوع</th>
                        <th className="p-2 text-right">المبلغ</th>
                        <th className="p-2 text-right">السبب</th>
                        <th className="p-2 text-right">الوقت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shiftDetails.cashMovements.map((m: any) => (
                        <tr key={m.id}>
                          <td className="p-2 font-bold">
                            {m.type === 'CASH_IN' ? (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <ArrowUpRight className="w-3.5 h-3.5" /> إيداع
                              </span>
                            ) : (
                              <span className="text-rose-600 flex items-center gap-1">
                                <ArrowDownRight className="w-3.5 h-3.5" /> صرف
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono font-bold">{Number(m.amount).toLocaleString()} ج.س</td>
                          <td className="p-2 text-slate-700">{m.reason}</td>
                          <td className="p-2 text-slate-400">
                            {new Date(m.createdAt).toLocaleTimeString('ar-SD', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-2 rounded">لا توجد حركات سحب أو إيداع</p>
              )}
            </div>

            {/* Invoices */}
            <div>
              <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-teal-600" />
                فواتير المبيعات الصادرة ({shiftDetails.invoices?.length || 0})
              </h4>
              {shiftDetails.invoices && shiftDetails.invoices.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs max-h-48 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0">
                      <tr>
                        <th className="p-2 text-right">رقم الفاتورة</th>
                        <th className="p-2 text-right">العميل</th>
                        <th className="p-2 text-right">طريقة الدفع</th>
                        <th className="p-2 text-right">الصافي</th>
                        <th className="p-2 text-right">المدفوع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shiftDetails.invoices.map((inv: any) => (
                        <tr key={inv.id}>
                          <td className="p-2 font-mono font-bold text-teal-700">{inv.invoiceNumber}</td>
                          <td className="p-2 text-slate-800">{inv.customer?.name || 'عميل نقدي'}</td>
                          <td className="p-2 text-slate-600">{inv.paymentMethod}</td>
                          <td className="p-2 font-mono font-bold text-slate-900">
                            {Number(inv.netAmount).toLocaleString()} ج.س
                          </td>
                          <td className="p-2 font-mono text-emerald-600">
                            {Number(inv.paidAmount).toLocaleString()} ج.س
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-2 rounded">لا توجد فواتير مبيعات مسجلة بعد</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handlePrintZReport(shiftDetails)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-amber-300 text-xs font-bold shadow transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>طباعة تقرير الإغلاق الحراري (Z-Report) 🖨️</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDetailsModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
