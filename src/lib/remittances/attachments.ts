import type { DocumentRecord } from '../db/schema';
export const ADVICE_MIME_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
export const MAX_ADVICE_BYTES = 8*1024*1024;
export function validateAdviceFile(file: Pick<File,'type'|'size'>): void {
  if (!ADVICE_MIME_TYPES.includes(file.type)) throw new Error('Choose a PDF, PNG, JPEG or WebP credit advice.');
  if (!file.size || file.size > MAX_ADVICE_BYTES) throw new Error('Credit advice must be between 1 byte and 8 MB.');
}
export async function encodeAdvice(file: File): Promise<Omit<DocumentRecord,'id'>> {
  validateAdviceFile(file);
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = data[0]===0x25 && data[1]===0x50 && data[2]===0x44 && data[3]===0x46;
  const png = data[0]===0x89 && data[1]===0x50 && data[2]===0x4e && data[3]===0x47;
  const jpeg = data[0]===0xff && data[1]===0xd8 && data[2]===0xff;
  const webp = String.fromCharCode(...data.slice(0,4))==='RIFF' && String.fromCharCode(...data.slice(8,12))==='WEBP';
  if (!(file.type==='application/pdf' ? pdf : file.type==='image/png' ? png : file.type==='image/jpeg' ? jpeg : webp)) throw new Error('The file contents do not match the selected document type.');
  let binary='';for (let i=0;i<data.length;i+=0x8000) binary+=String.fromCharCode(...data.subarray(i,i+0x8000));
  return {fileName:file.name,mimeType:file.type,contentBase64:btoa(binary),createdAt:new Date().toISOString()};
}
export function adviceBlob(document: DocumentRecord): Blob {
  if (!ADVICE_MIME_TYPES.includes(document.mimeType)) throw new Error('Unsupported credit advice format.');
  const binary=atob(document.contentBase64), data=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);
  return new Blob([data],{type:document.mimeType});
}
