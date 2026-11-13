'use client';
import {useState,type FormEvent} from 'react';
import type {Expense} from '@/lib/db/schema';
import {foreign,npr} from '@/lib/remittances/model';
import {reviewExpense} from '@/lib/tax-pack/repository';
export function ExpenseReview({expense}:{expense:Expense}){
 const [amount,setAmount]=useState(expense.assessment?String(expense.assessment.deductibleNPR):expense.currency==='NPR'?String(expense.amount):''),[note,setNote]=useState(expense.assessment?.note??''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(expense.id===undefined)return;setBusy(true);setMessage('');try{await reviewExpense(expense.id,Number(amount),note);setMessage('Deduction review saved.');}catch(e){setMessage(e instanceof Error?e.message:'Could not save review.');}finally{setBusy(false);}}
 return <form className="expense-review-row" onSubmit={submit}><header><div><strong>{expense.vendorName}</strong><span>{expense.category} · {expense.dateBS} BS</span></div><span className="mono">{foreign(expense.amount,expense.currency)}</span></header><div><label className="field">Reviewed deductible NPR<input required type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Enter documented NPR cost basis"/></label><label className="field">NPR basis / deduction rationale<input required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Receipt / conversion / allowable proportion"/></label><button className="button secondary" disabled={busy}>{busy?'Saving…':'Save review'}</button></div><p role="status">{message|| (expense.assessment?`${npr(expense.assessment.deductibleNPR)} included in reviewed deductions`:'Not included until reviewed. Use zero for non-deductible expenditure.')}</p></form>;
}
