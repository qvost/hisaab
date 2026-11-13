import {db} from '../db';
import {defaultSettings} from '../db/schema';
import {validateExpenseAssessment,type TaxPackData} from './model';
export async function readTaxPackData(fiscalYear:string):Promise<TaxPackData>{
 return db.transaction('r',[db.settings,db.remittances,db.expenses,db.invoices,db.clients,db.bank_transactions,db.documents],async()=>{
  const [profile,remittances,expenses,invoices,clients,bankTransactions,documentIds]=await Promise.all([db.settings.get('profile'),db.remittances.where('fiscalYearBS').equals(fiscalYear).toArray(),db.expenses.where('fiscalYearBS').equals(fiscalYear).toArray(),db.invoices.toArray(),db.clients.toArray(),db.bank_transactions.toArray(),db.documents.toCollection().primaryKeys()]);
  return {profile:profile??defaultSettings(),remittances,expenses,invoices,clients,bankTransactions,documentIds};
 });
}
export async function reviewExpense(id:number,amount:number,note:string):Promise<void>{const assessment=validateExpenseAssessment(amount,note);const updated=await db.expenses.update(id,{assessment});if(!updated)throw new Error('This expense no longer exists.');}
export async function addBusinessExpense(input:import('../db/records').NewExpense,deductibleNPR:number|null,note:string):Promise<string>{
 const {createExpense}=await import('../db/records');
 const assessment=deductibleNPR===null?null:validateExpenseAssessment(deductibleNPR,note);
 return db.transaction('rw',db.expenses,async()=>{const id=await createExpense(input);if(assessment)await db.expenses.update(id,{assessment});const row=await db.expenses.get(id);if(!row)throw new Error('Could not read the saved expense.');return row.fiscalYearBS;});
}
