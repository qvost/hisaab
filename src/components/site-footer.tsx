import { ArrowUpRight, Github, Linkedin, Mail } from 'lucide-react';
import ScrollBlurFooter from '@/components/ui/scroll-blur-footer';

const contacts = [
  { label: 'GitHub', href: 'https://github.com/qvost', icon: Github },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/qvost/', icon: Linkedin },
  { label: 'Gmail', href: 'mailto:qvostwon@gmail.com', icon: Mail },
];

export function SiteFooter() {
  return <>
    <footer className="site-footer">
      <span className="footer-credit">Built by <a href="https://github.com/qvost" target="_blank" rel="noopener noreferrer">Siddid Pandey</a></span>
      <nav aria-label="Contact links">
        {contacts.map(({ label, href, icon: Icon }) => <a key={label} href={href} {...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          <Icon size={14} strokeWidth={1.5} /><span>{label}</span><ArrowUpRight size={12} aria-hidden="true" />
        </a>)}
      </nav>
    </footer>
    <ScrollBlurFooter />
  </>;
}
