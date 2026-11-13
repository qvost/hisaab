import type {BankTransaction,Client,Expense,Invoice,RemittanceTransaction,Settings} from '../db/schema';
import {getFiscalYearDateRange} from '../calendar/fiscal-year';
import {getDaysInBsMonth,bsToAd,formatBsIso} from '../calendar/samayamiiti';
import {summarizeRemittances,remittanceMath} from '../remittances/model';
import {roundNpr} from '../forex/calculator';
export type FilingMode='individual'|'business';
export interface TaxPackData {profile:Settings;remittances:RemittanceTransaction[];expenses:Expense[];invoices:Invoice[];clients:Client[];bankTransactions:BankTransaction[];documentIds:number[]}
export function taxPackSummary(data:TaxPackData,fiscalYear:string,mode:FilingMode){
 const range=getFiscalYearDateRange(fiscalYear),remittances=data.remittances.filter(r=>r.fiscalYearBS===fiscalYear&&r.foreignCurrency!=='NPR'),expenses=data.expenses.filter(e=>e.fiscalYearBS===fiscalYear),totals=summarizeRemittances(remittances);
 const deadlineYear=Number(fiscalYear.slice(0,4))+1,deadlineDay=getDaysInBsMonth(deadlineYear,6),deadlineBS=formatBsIso(deadlineYear,6,deadlineDay),deadlineAD=bsToAd(deadlineYear,6,deadlineDay).toISOString().slice(0,10);
 const documents=new Set(data.documentIds),matched=new Set(data.bankTransactions.filter(b=>b.reconciliationStatus==='matched').map(b=>b.matchedRemittanceId));
 const expectedTds=roundNpr(remittances.reduce((sum,r)=>sum+remittanceMath(r).expectedTds5PctNPR,0));
 const reviewedExpenses=expenses.filter(e=>e.assessment!==undefined),deductions=roundNpr(reviewedExpenses.reduce((sum,e)=>sum+(e.assessment?.deductibleNPR??0),0));
 const missingAdvice=remittances.filter(r=>r.audit?.attachmentId==null||!documents.has(r.audit.attachmentId)).length,unreconciled=remittances.filter(r=>r.id===undefined||!matched.has(r.id)).length;
 const unreviewedExpenses=expenses.length-reviewedExpenses.length;
 const profileComplete=/^\d{9}$/.test(data.profile.panNumber)&&!!(data.profile.businessName||data.profile.ownerName).trim()&&!!data.profile.ownerName.trim()&&!!data.profile.address?.trim();
 const issues:string[]=[];
 if(!(data.profile.businessName||data.profile.ownerName).trim()||!data.profile.ownerName.trim()||!data.profile.address?.trim())issues.push('Complete taxpayer name, owner and registered address in Settings.');
 if(!/^\d{9}$/.test(data.profile.panNumber))issues.push('Taxpayer PAN is missing or invalid.');
 if(totals.unverified)issues.push(`${totals.unverified} recorded NRB rate(s) lack official API/cache provenance.`);
 if(missingAdvice)issues.push(`${missingAdvice} remittance(s) have no saved credit advice.`);
 if(unreconciled)issues.push(`${unreconciled} remittance(s) are not linked to a matched bank statement credit.`);
 if(totals.discrepancies)issues.push(`${totals.discrepancies} bank withholding amount(s) differ from the requested 5% calculation.`);
 if(mode==='business'&&unreviewedExpenses)issues.push(`${unreviewedExpenses} expense(s) still need a reviewed deductible NPR basis.`);
 return {fiscalYear,mode,profileComplete,range:{startBS:range.startBS,endBS:range.endBS,startAD:range.startAD.toISOString().slice(0,10),endAD:range.endAD.toISOString().slice(0,10)},deadlineBS,deadlineAD,totals,remittances,expenses,expectedTds,tdsDifference:roundNpr(totals.tds-expectedTds),deductions,reviewedExpenseCount:reviewedExpenses.length,unreviewedExpenses,netTaxableIncomeEstimate:roundNpr(totals.gross+totals.variance-deductions),missingAdvice,unreconciled,issues};
}
export type TaxPackSummary=ReturnType<typeof taxPackSummary>;
export function validateExpenseAssessment(amount:number,note:string){if(!Number.isFinite(amount)||amount<0)throw new Error('Deductible NPR must be a finite non-negative amount.');if(!note.trim())throw new Error('Add the NPR cost basis and deduction rationale.');return {deductibleNPR:roundNpr(amount),note:note.trim(),reviewedAt:new Date().toISOString()};}
