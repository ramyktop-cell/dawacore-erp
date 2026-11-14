import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/http';
import { getCurrentUser } from '../../utils/permissions';

const money = (v: any) => v == null ? 'غير متاح' : Number(v).toLocaleString('ar', {minimumFractionDigits:2, maximumFractionDigits:2});
const price = (v: any) => v == null ? 'غير متاح' : Number(v).toLocaleString('ar', {minimumFractionDigits:2, maximumFractionDigits:6});
const qty = (v: any) => Number(v).toLocaleString('ar', {maximumFractionDigits:3});
const labels: Record<string,string> = {PURCHASE:'توريد شراء', SALE:'مبيعات', SALE_RETURN:'مرتجع مبيعات', PURCHASE_RETURN:'مرتجع مشتريات', TRANSFER_IN:'تحويل وارد', TRANSFER_OUT:'تحويل صادر', INVENTORY_ADJUSTMENT:'تسوية جرد', DAMAGE:'تالف', DAMAGED_RETURN:'مرتجع تالف'};
async function get(url: string, signal?: AbortSignal) {
  const r=await apiFetch(url,{signal}); const body=await r.json();
  if(!r.ok) throw new Error(Array.isArray(body.message)?body.message.join('، '):body.message || 'تعذر تحميل التقرير');
  return body;
}

export const BranchStockReportPage: React.FC = () => {
  const [branches,setBranches]=useState<any[]>([]), [branchId,setBranchId]=useState(getCurrentUser()?.branchId || '');
  const [mode,setMode]=useState<'valuation'|'ledger'>('valuation');
  const [valuation,setValuation]=useState<any>(null), [ledger,setLedger]=useState<any>(null);
  const [medicineId,setMedicineId]=useState(''), [catalog,setCatalog]=useState<any[]>([]), [search,setSearch]=useState('');
  const today=new Date().toLocaleDateString('en-CA');
  const [from,setFrom]=useState(today.slice(0,8)+'01'), [to,setTo]=useState(today);
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const ac=new AbortController();
    get('/api/branches?limit=1000&companyId='+encodeURIComponent(getCurrentUser()?.companyId || ''),ac.signal).then(b=>setBranches((b.items || b).filter((v:any)=> !getCurrentUser()?.branchId || v.id===getCurrentUser()?.branchId)))
      .catch(e=>{if(e.name!=='AbortError') setError(e.message);});
    return ()=>ac.abort();
  },[]);
  useEffect(()=>{generation.current++;setBusy(false);setValuation(null);setLedger(null);setError('');},[branchId,mode,medicineId,from,to]);
  useEffect(()=>{setMedicineId('');setCatalog([]);},[branchId]);
  useEffect(()=>{
    if(!branchId || mode!=='ledger') return;
    const ac=new AbortController(); const timer=setTimeout(()=>{
      get('/api/reports/branch-stock/items?'+new URLSearchParams({branchId,search}),ac.signal).then(setCatalog)
        .catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    },250);
    return ()=>{clearTimeout(timer);ac.abort();};
  },[branchId,search,mode]);
  async function load(page=1) {
    const version=++generation.current; setBusy(true);setError('');
    try {
      const params=new URLSearchParams(); if(branchId) params.set('branchId',branchId);
      if(mode==='ledger') {
        if(!branchId || !medicineId) throw new Error('اختر المخزن والصنف أولاً');
        params.set('medicineId',medicineId); params.set('from',from);params.set('to',to);params.set('page',String(page));
      }
      const data=await get('/api/reports/branch-stock/'+mode+'?'+params);
      if(generation.current===version) {if(mode==='valuation')setValuation(data);else setLedger(data);}
    } catch(e) {if(generation.current===version){setValuation(null);setLedger(null);setError(e instanceof Error?e.message:'تعذر التحميل');}}
    finally {if(generation.current===version)setBusy(false);}
  }
  const card=(title:string,value:any)=><div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-600">{title}</div><strong className="text-xl">{money(value)}</strong></div>;
  const input='rounded-lg border border-slate-300 bg-white p-2 text-sm';
  const table='w-full text-sm border-collapse [&_th]:border [&_td]:border [&_th]:p-2 [&_td]:p-2 [&_th]:bg-slate-100';
  return <div className="p-6 space-y-4 text-slate-800" dir="rtl">
    <style>{`@media print {html,body,#root,#root>div,#root main {height:auto!important;overflow:visible!important} #branch-stock-print div {overflow:visible!important} body * {visibility:hidden} #branch-stock-print, #branch-stock-print * {visibility:visible} #branch-stock-print {position:absolute;left:0;top:0;width:100%;background:white} .stock-no-print {display:none!important} table {font-size:10px} tr {break-inside:avoid}}`}</style>
    <h1 className="text-2xl font-bold">تقارير المخازن / الفروع</h1>
    <p className="text-sm">المخزن هو رصيد الفرع. البيع يخصم من مخزن فرع المستخدم والوردية المفتوحة. <Link className="text-teal-700 underline" to="/pos">فتح المبيعات</Link></p>
    <div className="flex flex-wrap gap-3 items-center">
      <select aria-label="نوع التقرير" className={input} value={mode} onChange={e=>setMode(e.target.value as any)}><option value="valuation">تقييم المخزون</option><option value="ledger">حركة المخزون التفصيلية</option></select>
      <select aria-label="المخزن" className={input} value={branchId} onChange={e=>setBranchId(e.target.value)}>
        {!getCurrentUser()?.branchId && <option value="">كل المخازن — التقييم فقط</option>}
        {branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
      </select>
      {mode==='ledger' && <><input aria-label="بحث الصنف" className={input} value={search} placeholder="بحث اسم أو كود الصنف" onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="الصنف" className={input} value={medicineId} onChange={e=>setMedicineId(e.target.value)}><option value="">اختر الصنف</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.code} — {m.tradeName}</option>)}</select>
        <label>من <input type="date" className={input} value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>إلى <input type="date" className={input} value={to} onChange={e=>setTo(e.target.value)}/></label></>}
      <button disabled={busy} onClick={()=>load()} className="rounded-lg bg-teal-700 text-white px-5 py-2 disabled:opacity-50">{busy?'جارٍ التحميل…':'عرض التقرير'}</button>
      <button disabled={busy || (!valuation && !ledger)} onClick={()=>window.print()} className={input}>طباعة / حفظ PDF</button>
    </div>
    {error && <p role="alert" className="bg-red-50 text-red-800 p-3 rounded-lg">{error}</p>}
    <div id="branch-stock-print" className="space-y-5">
      {valuation && <>
        <h2 className="text-xl font-bold">تقييم المخزون — {branchId ? branches.find(b=>b.id===branchId)?.name : 'جميع مخازن الشركة'}</h2>
        <p className="text-xs">بتاريخ {new Date(valuation.generatedAt).toLocaleString('ar')} — {valuation.basis}</p>
        <div className="grid grid-cols-3 gap-3">{card('القيمة الدفترية بالتكلفة',valuation.totals.bookValue)}{card('إجمالي قيمة المخزون بسعر البيع',valuation.totals.saleValue)}{card(valuation.totals.missingMarketPrices?'القيمة السوقية المتاحة — غير مكتملة':'القيمة السوقية بآخر سعر شراء',valuation.totals.marketValue)}</div>
        {valuation.totals.missingMarketPrices>0 && <p className="text-amber-800 bg-amber-50 p-2">يوجد {valuation.totals.missingMarketPrices} صنف/فرع دون شراء مستلم؛ لم يُفترض سعر سوقي لها، والإجمالي السوقي لا يشملها.</p>}
        {valuation.branches.map((b:any)=><section key={b.id} className="space-y-2">
          <h3 className="font-bold text-lg">مخزن {b.name} — {b.code}</h3>
          <div className="overflow-auto"><table className={table}><thead><tr>{['الكود','الصنف','الوحدة','الكمية','سعر البيع / متوسط الدفعات','جملة سعر البيع','التكلفة الدفترية','آخر سعر شراء','الجملة السوقية'].map(t=><th key={t}>{t}</th>)}</tr></thead>
            <tbody>{valuation.items.filter((r:any)=>r.branchId===b.id).map((r:any)=><tr key={r.medicineId}><td>{r.code}</td><td>{r.tradeName}<br/><button className="stock-no-print text-teal-700 underline text-xs" onClick={()=>{setBranchId(b.id);setMode('ledger');setTimeout(()=>setMedicineId(r.medicineId),0);}}>كشف الحركة</button></td><td>{r.unit}</td><td>{qty(r.quantity)}</td><td>{price(r.saleUnitPrice)}</td><td>{money(r.saleValue)}</td><td>{money(r.bookValue)}</td><td title={r.lastPurchaseNumber || ''}>{price(r.lastPurchasePrice)}</td><td>{money(r.marketValue)}</td></tr>)}</tbody>
            <tfoot><tr className="font-bold"><td colSpan={5}>إجمالي مخزن {b.name}</td><td>{money(b.totals.saleValue)}</td><td>{money(b.totals.bookValue)}</td><td>{b.totals.missingMarketPrices?'تقييم سوقي جزئي':''}</td><td>{money(b.totals.marketValue)}</td></tr></tfoot>
          </table></div>
        </section>)}
        <p className="font-bold">إجمالي جميع المخازن المعروضة: البيع {money(valuation.totals.saleValue)} — التكلفة الدفترية {money(valuation.totals.bookValue)} — السوقي {money(valuation.totals.marketValue)}</p>
      </>}
      {ledger && <>
        <h2 className="text-xl font-bold">كشف حركة مخزن {ledger.branch.name} — {ledger.medicine.tradeName} ({ledger.medicine.code})</h2>
        <p>من {ledger.from} إلى {ledger.to} — الوحدة: {ledger.unit} — التوقيت: {ledger.timezone}</p>
        <p>رصيد افتتاحي: {qty(ledger.opening)} | وارد الفترة: {qty(ledger.incoming)} | صادر الفترة: {qty(ledger.outgoing)} | رصيد ختامي: {qty(ledger.closing)}</p>
        {ledger.openingReconstructed && <p className="text-amber-800 text-sm">الرصيد الافتتاحي مستنتج من الرصيد الحالي والحركات المسجلة؛ توجد كميات افتتاحية أو فروق تاريخية لا تغطيها سجلات الحركة. راجع الجرد عند الاعتماد.</p>}
        <div className="overflow-auto"><table className={table}><thead><tr>{['التاريخ','الحركة','المرجع','العميل / المورد','الدفعة','داخل','خارج','الرصيد'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>
          {ledger.items.map((r:any)=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('ar',{timeZone:ledger.timezone || 'Africa/Cairo'})}</td><td>{labels[r.transactionType] || r.transactionType}</td><td>{r.referenceId}<div className="text-xs">{r.notes}</div></td><td>{r.partyName}</td><td>{r.batchNumber}</td><td>{qty(r.incoming)}</td><td>{qty(r.outgoing)}</td><td>{qty(r.balance)}</td></tr>)}
        </tbody></table></div>
        <p>الصفحة {ledger.page} من {Math.max(1,Math.ceil(ledger.total/ledger.pageSize))} — {ledger.total} حركة. الطباعة تشمل الصفحة الحالية؛ إجماليات الفترة تشمل جميع الصفحات.</p>
        <div className="stock-no-print flex gap-3"><button disabled={busy || ledger.page<=1} onClick={()=>load(ledger.page-1)} className={input}>السابق</button><button disabled={busy || ledger.page*ledger.pageSize>=ledger.total} onClick={()=>load(ledger.page+1)} className={input}>التالي</button></div>
      </>}
    </div>
  </div>;
};
