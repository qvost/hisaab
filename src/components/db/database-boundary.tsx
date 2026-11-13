'use client';
import { Component, type ReactNode } from 'react';
export class DatabaseBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main id="main" className="workspace"><section className="panel" style={{ padding: 24 }} role="alert"><h1>Local storage is unavailable</h1><p>Hisaab needs browser IndexedDB access. Check your browser’s storage settings, then reload.</p><button className="button primary" onClick={() => window.location.reload()}>Try again</button></section></main>;
    return this.props.children;
  }
}
