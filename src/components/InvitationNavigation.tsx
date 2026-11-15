import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Copy } from '../config/copy';

type Icon = 'couple' | 'event' | 'story' | 'rsvp';
function DockIcon({ name }: { name: Icon }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'couple' && <><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="8" r="2.6" /><path d="M3.8 18.5c.35-3.45 1.7-5.35 4.2-5.35s3.85 1.9 4.2 5.35M11.8 18.5c.35-3.45 1.7-5.35 4.2-5.35s3.85 1.9 4.2 5.35M10.15 11.15 12 13l1.85-1.85" /></>}
    {name === 'event' && <><rect x="3.5" y="5.2" width="17" height="15" rx="2.2" /><path d="M7.5 3.5v3.4M16.5 3.5v3.4M3.5 9.2h17m-11.3 5.6 1.75 1.75 3.85-4.05" /></>}
    {name === 'story' && <><path d="M4 5.3c2.85-.35 5.25.25 8 2.15v11.25c-2.75-1.9-5.15-2.5-8-2.15zM20 5.3c-2.85-.35-5.25.25-8 2.15v11.25c2.75-1.9 5.15-2.5 8-2.15z" /><path d="M9.4 11.1c.95-.8 2.05-.15 2.6.75.55-.9 1.65-1.55 2.6-.75 1.35 1.15-.15 2.85-2.6 4.45-2.45-1.6-3.95-3.3-2.6-4.45Z" /></>}
    {name === 'rsvp' && <><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="m4.1 7 7.9 6 7.9-6m-4.9 9 1.35 1.35 2.55-2.75" /></>}
  </svg>;
}

export function InvitationNavigation({ t, today }: { t: Copy; today: boolean }) {
  const [active, setActive] = useState('hero');
  const eventId = today ? 'today' : 'events';
  useEffect(() => {
    const sections = ['hero', 'couple', eventId, 'story', 'rsvp'].map(id => document.getElementById(id));
    let frame = 0;
    const update = () => {
      frame = 0;
      const visible = sections.filter(section => section && section.getBoundingClientRect().top <= Math.min(innerHeight * .35, 240));
      const current = visible[visible.length - 1];
      if (current) setActive(current.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', schedule); removeEventListener('resize', schedule); };
  }, [eventId]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    history.replaceState(null, '', '#' + id);
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    setActive(id);
  };
  const items: { id: string; label: string; icon: Icon }[] = [
    { id: 'couple', label: t.coupleTitle, icon: 'couple' },
    { id: eventId, label: t.navEvents, icon: 'event' },
    { id: 'story', label: t.navStory, icon: 'story' },
    { id: 'rsvp', label: 'RSVP', icon: 'rsvp' },
  ];
  return <nav className="ig-bubble-nav" aria-label={t.navigationLabel}>
    {items.map(item => <a key={item.id} href={'#' + item.id} onClick={event => navigate(event, item.id)} aria-current={active === item.id ? 'location' : undefined}>
      <DockIcon name={item.icon} /><span>{item.label}</span>
    </a>)}
  </nav>;
}
