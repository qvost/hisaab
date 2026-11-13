'use client';
import {useLiveQuery} from 'dexie-react-hooks';
import {readTaxPackData} from './repository';
import type {TaxPackData} from './model';
export function useTaxPack(fiscalYear:string):TaxPackData|undefined{return useLiveQuery(()=>readTaxPackData(fiscalYear),[fiscalYear]);}
