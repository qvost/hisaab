'use client';
import './settings.css';
import '../remittances/remittances.css';
import Link from 'next/link';
import {useState} from 'react';
import {ChevronRight,ShieldCheck} from 'lucide-react';
import {DatabaseBoundary} from '@/components/db/database-boundary';
import {ProfileForm} from '@/components/settings/profile-form';
import {VaultCenter} from '@/components/settings/vault-center';
import {useSettings} from '@/lib/db/hooks';
export default function SettingsPage(){return <DatabaseBoundary><SettingsWorkspace/></DatabaseBoundary>;}
function SettingsWorkspace(){const profile=useSettings(),[notice,setNotice]=useState('');return <main id="main" className="workspace settings-workspace"><div className="workspace-heading"><Link href="/" className="wordmark"><span className="brand-mark">हि</span>hisaab<span className="brand-divider"/><span className="workspace-name">Workspace</span></Link><span className="local-badge"><ShieldCheck size={13}/>Stored locally</span></div><div className="page-heading"><div><div className="breadcrumb"><Link href="/">Workspace</Link><ChevronRight size={12}/><span>Vault & settings</span></div><h1>Settings</h1></div></div><p className="settings-notice" role="status">{notice}</p><div className="settings-layout">{profile?<ProfileForm key={JSON.stringify(profile)} initial={profile} onSaved={()=>setNotice('Profile saved. New invoices and tax packs will use these details.')}/>:<section className="panel settings-loading">Loading your local profile…</section>}<VaultCenter/></div></main>;}
