/** ZIP with stored (uncompressed) entries, CRC32 and UTF-8 names. No external compression dependency. */
const encoder=new TextEncoder();
export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipFiles(files:{name:string;bytes:Uint8Array}[],createdAt=new Date()):Uint8Array<ArrayBuffer>{
 if(files.length>65535)throw new Error('Too many archive entries.');
 const seen=new Set<string>(),entries=files.map(file=>{if(!file.name||file.name.startsWith('/')||file.name.split('/').some(p=>p==='..')||seen.has(file.name))throw new Error('Invalid or duplicate archive filename.');seen.add(file.name);const name=encoder.encode(file.name);if(name.length>65535||file.bytes.length>0xffffffff)throw new Error('Archive entry exceeds ZIP limits.');return {...file,nameBytes:name,crc:crc32(file.bytes)};});
 const length=entries.reduce((sum,e)=>sum+30+e.nameBytes.length+e.bytes.length+46+e.nameBytes.length,22);if(length>0xffffffff)throw new Error('Archive exceeds ZIP32 limits.');
 const output=new Uint8Array(length),view=new DataView(output.buffer),year=Math.min(2107,Math.max(1980,createdAt.getUTCFullYear())),date=((year-1980)<<9)|((createdAt.getUTCMonth()+1)<<5)|createdAt.getUTCDate(),time=(createdAt.getUTCHours()<<11)|(createdAt.getUTCMinutes()<<5)|Math.floor(createdAt.getUTCSeconds()/2);
 let offset=0;const records:{entry:typeof entries[number];offset:number}[]=[];
 for(const entry of entries){const start=offset;view.setUint32(offset,0x04034b50,true);view.setUint16(offset+4,20,true);view.setUint16(offset+6,0x0800,true);view.setUint16(offset+10,time,true);view.setUint16(offset+12,date,true);view.setUint32(offset+14,entry.crc,true);view.setUint32(offset+18,entry.bytes.length,true);view.setUint32(offset+22,entry.bytes.length,true);view.setUint16(offset+26,entry.nameBytes.length,true);output.set(entry.nameBytes,offset+30);output.set(entry.bytes,offset+30+entry.nameBytes.length);offset+=30+entry.nameBytes.length+entry.bytes.length;records.push({entry,offset:start});}
 const central=offset;
 for(const {entry,offset:start} of records){view.setUint32(offset,0x02014b50,true);view.setUint16(offset+4,20,true);view.setUint16(offset+6,20,true);view.setUint16(offset+8,0x0800,true);view.setUint16(offset+12,time,true);view.setUint16(offset+14,date,true);view.setUint32(offset+16,entry.crc,true);view.setUint32(offset+20,entry.bytes.length,true);view.setUint32(offset+24,entry.bytes.length,true);view.setUint16(offset+28,entry.nameBytes.length,true);view.setUint32(offset+42,start,true);output.set(entry.nameBytes,offset+46);offset+=46+entry.nameBytes.length;}
 view.setUint32(offset,0x06054b50,true);view.setUint16(offset+8,entries.length,true);view.setUint16(offset+10,entries.length,true);view.setUint32(offset+12,offset-central,true);view.setUint32(offset+16,central,true);
 return output;
}
