import {db} from '../db';
import type {Settings} from '../db/schema';
import {validateProfile,validateResetConfirmation} from './profile';
export async function saveProfile(input:Settings):Promise<void>{await db.settings.put(validateProfile(input));}
export async function resetLocalDatabase(confirmation:string):Promise<void>{
 validateResetConfirmation(confirmation);
 await db.transaction('rw',db.tables,async()=>{await Promise.all(db.tables.map(t=>t.clear()));});
}
