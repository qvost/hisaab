'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ShieldCheck } from 'lucide-react';
export function Drawer({title,description,children,onClose,busy=false,closeRequested=false,wide=false}:{title:string;description:string;children:ReactNode;onClose:()=>void;busy?:boolean;closeRequested?:boolean;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null), closeHandler=useRef(onClose);
  const [closing,setClosing]=useState(false);
  useEffect(()=>{closeHandler.current=onClose;},[onClose]);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  useEffect(()=>{if(closeRequested)setClosing(true);},[closeRequested]);
  useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>{ref.current?.close();closeHandler.current();},140);return()=>clearTimeout(timer);},[closing]);
  return <dialog ref={ref} className={`remittance-drawer ${wide?'drawer-wide':''} ${closing?'drawer-closing':''}`} aria-labelledby="drawer-title" aria-describedby="drawer-description" onCancel={e=>{e.preventDefault();if(!busy)setClosing(true);}} onClick={e=>{if(e.target===e.currentTarget&&!busy)setClosing(true);}}>
    <div className="drawer-content"><header className="drawer-header"><div><span className="drawer-eyebrow"><ShieldCheck size={12}/>On this device</span><h2 id="drawer-title">{title}</h2><p id="drawer-description">{description}</p></div><button type="button" className="icon-button" aria-label="Close drawer" disabled={busy} onClick={()=>setClosing(true)}><X size={19}/></button></header>{children}</div>
  </dialog>;
}
