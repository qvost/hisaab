import type {Settings} from '../db/schema';
export const normalizePan=(value:string):string=>value.trim().replace(/[०-९]/g,d=>String('०१२३४५६७८९'.indexOf(d)));
export function validateProfile(input:Settings):Settings{
 const businessName=input.businessName.trim(),ownerName=input.ownerName.trim(),panNumber=normalizePan(input.panNumber),address=input.address?.trim()??'';
 if(!businessName||!ownerName||!address)throw new Error('Enter your business/freelancer name, owner name and registered address.');
 if(!/^\d{9}$/.test(panNumber))throw new Error('PAN must have exactly nine digits.');
 if(!['freelancer_5pct_final','sole_proprietor','pvt_ltd'].includes(input.taxMode))throw new Error('Choose a valid tax mode.');
 const defaultBankAccounts=input.defaultBankAccounts.map((bank,index)=>{
  const bankName=bank.bankName.trim(),accountName=bank.accountName.trim(),accountNumber=bank.accountNumber.replace(/\s/g,''),swiftCode=bank.swiftCode.trim().toUpperCase(),accountType=bank.accountType??'NPR';
  if(!bankName||!accountName||! /^[A-Za-z0-9-]{4,40}$/.test(accountNumber))throw new Error(`Complete or remove bank account ${index+1}. Preserve account numbers as text.`);
  if(accountType!=='NPR'&&accountType!=='FCY')throw new Error('Account type must be NPR or FCY.');
  if((swiftCode&&!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(swiftCode))||(accountType==='FCY'&&!swiftCode))throw new Error(`Enter a valid 8- or 11-character SWIFT/BIC for bank account ${index+1}.`);
  return {bankName,accountName,accountNumber,swiftCode,accountType,branch:bank.branch?.trim()??'',routingNotes:bank.routingNotes?.trim()??''};
 });
 return {id:'profile',businessName,ownerName,panNumber,address,taxMode:input.taxMode,defaultBankAccounts};
}
export function validateResetConfirmation(value:string):void{if(value!=='RESET ALL DATA')throw new Error('Type RESET ALL DATA exactly to erase local records.');}
