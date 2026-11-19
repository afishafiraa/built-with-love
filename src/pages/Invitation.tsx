import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import '../styles/blossom.css';
import '../styles/garden-theatre.css';
import { COPY } from '../config/copy';
import type { Copy } from '../config/copy';
import { RIBBON, THREAD_X, THREAD, slotSrc } from '../config/slots';
import { InvitationNavigation } from '../components/InvitationNavigation';
import { EnvelopePlayback } from '../components/EnvelopePlayback';
import { fontVars } from '../config/fonts';
import { isPreview, useConfig } from '../lib/config';
import { copyText } from '../lib/clipboard';
import { lockHeroLayout } from '../lib/hero-layout';
import { useGuest } from '../lib/guest';
import { useMusic } from '../lib/music';
import { api, backendReady } from '../lib/api';
import { clearQueuedRsvp, queueRsvp, startOutbox } from '../lib/outbox';
import type { Lang, WeddingConfig } from '../types';

/* Blossom Garden v2 — a faithful port of the Claude Design prototype, wired to
   the Supabase backend (RSVP, wishes, visit tracking) and the ?to= guest link. */

const Assets = createContext<Record<string, string>>({});

/* Two section backgrounds only — sage green and paper white; everything else is
   type, card and ornament colour. */
/* Ivory Blossom Garden: warm olive and taupe echo the dress, while muted gold
   supplies a little celebratory light without turning the invitation yellow. */
const SAGE = '#444C36', DEEP = SAGE, PAPER = '#F3EADB', CARD = '#FFF9EF';
const INK = '#3E352C', RED = '#8B594A', RED_TEXT = '#8B594A', GOLD = '#C9A15D';

/* ---------- small building blocks ---------- */

type Flip = 'x' | 'y' | 'xy';
const FLIP: Record<Flip, string> = { x: 'scaleX(-1)', y: 'scaleY(-1)', xy: 'scale(-1,-1)' };

/* The flip sits on the <img> so the wrapper's sway/float animation can't cancel it. */
function Orn({ slot, style, className, flip, eager = false, priority = false }: { slot: string; style: CSSProperties; className?: string; flip?: Flip; eager?: boolean; priority?: boolean }) {
  const assets = useContext(Assets);
  const src = slotSrc(assets, slot);
  if (!src) return null;
  return (
    <div className={'bl-orn' + (className ? ' ' + className : '')} style={style}>
      <img src={src} alt="" loading={eager || priority ? 'eager' : 'lazy'} {...{ fetchpriority: priority ? 'high' : 'auto' }} decoding="async" style={flip ? { transform: FLIP[flip] } : undefined} />
    </div>
  );
}

function PortraitMedia({ photoSlot, fallbackSlot, alt }: { photoSlot: string; fallbackSlot: string; alt: string }) {
  const assets = useContext(Assets);
  const custom = assets[photoSlot];
  const src = custom || slotSrc(assets, fallbackSlot);
  if (!src) return null;
  return <img className={'ig-portrait-media ' + (custom ? 'is-photo' : 'is-illustration')} src={src} alt={alt} width="318" height="395" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

function Monogram({ className = '' }: { className?: string }) {
  const assets = useContext(Assets);
  const src = slotSrc(assets, 'v-monogram');
  if (!src) return null;
  const mask = 'url(' + JSON.stringify(src) + ')';
  return <div aria-hidden="true" className={'ig-monogram ' + className} style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

function Seam({ from, orn = false }: { from: string; orn?: boolean }) {
  const curve = 'M0,0 ' + 'q20,24 40,0 '.repeat(12);
  return (
    <div className="ig-section-seam" aria-hidden="true" style={{ background: from === PAPER ? SAGE : PAPER }}>
      <svg viewBox="0 0 480 13" preserveAspectRatio="none"><path d={curve + 'L0,0 Z'} fill={from} /></svg>
      {orn && <Orn slot="orn-seam" style={{ width: '36%', height: 90, left: '50%', translate: '-50% 0', top: -45 }} />}
    </div>
  );
}

/** 'hanif', '@hanif' or a full instagram.com URL -> 'hanif' */
function igHandle(v: string) {
  return String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
}

function IgButton({ handle, align }: { handle: string; align: 'left' | 'right' }) {
  const h = igHandle(handle);
  if (!h) return null;
  return (
    <a href={'https://www.instagram.com/' + encodeURIComponent(h) + '/'} target="_blank" rel="noopener noreferrer" aria-label={'Instagram @' + h}
      className="bl-ig" style={{ marginLeft: align === 'right' ? 'auto' : undefined }}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
      </svg>
      <span>@{h}</span>
    </a>
  );
}

function Kicker({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div className="bl-kicker bl-reveal-kicker" style={{ color: color || RED_TEXT, ...style }}>{children}</div>;
}

const two = (n: number) => String(n).padStart(2, '0');

function splitTime(val: string) {
  const m = String(val).match(/^([\d.:]+)\s*(.*)$/);
  return m ? { hour: m[1], zone: m[2] || '' } : { hour: val, zone: '' };
}

function safeDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date('2027-01-03T09:00:00+07:00') : d;
}

function isWeddingDay(iso: string) {
  const eventDay = iso.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!eventDay) return false;
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}` === eventDay;
}

function fmtWhen(iso: string, t: Copy) {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 60000) return t.justNow;
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  if (min < 60) return t.minutesAgo.replace('{n}', String(min));
  if (h < 24) return t.hoursAgo.replace('{n}', String(h));
  if (d === 1) return t.yesterday;
  return t.daysAgo.replace('{n}', String(d));
}

function useSectionReveal(active: boolean) {
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.ig-section-heading, .ig-portrait-card, .ig-agenda, .ig-chapter, .ig-form-heading, .ig-countdown-note, .ig-quote-paper, .ig-map-frame, .ig-wish-form, .ig-closing-copy, .bl-day-card, .ig-gift'));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .08, rootMargin: '0px 0px -24px 0px' });
    sections.forEach(section => { section.classList.add('ig-reveal'); observer.observe(section); });
    return () => { observer.disconnect(); sections.forEach(section => section.classList.remove('ig-reveal')); };
  }, [active]);
}

/* ---------- page ---------- */

export default function Invitation() {
  const { config: cfg, ready: configReady } = useConfig();
  const preview = isPreview();
  const guest = useGuest(!preview);
  const [langPick, setLangPick] = useState<Lang | null>(null);
  const lang: Lang = langPick || cfg.lang || 'id';
  const t = COPY[lang] || COPY.id;
  const [closed, setClosed] = useState(true);
  const [opening, setOpening] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [eventDay, setEventDay] = useState(() => isWeddingDay(cfg.dateISO));
  const music = useMusic(cfg.musicUrl, cfg.musicTitle);
  const contentRef = useRef<HTMLDivElement>(null);
  useSectionReveal(!closed);

  const groom = cfg.groomName || 'Ave';
  const bride = cfg.brideName || 'Mumu';
  const coupleShort = groom + ' & ' + bride;
  const dateLabel = lang === 'en' ? cfg.dateLabelEn || cfg.dateLabel : cfg.dateLabel;
  const showDayCard = eventDay
    || (preview && new URLSearchParams(location.search).has('previewDay'));
  const weddingHashtag = (() => {
    const clean = String(cfg.hashtag || '').trim().replace(/\s+/g, '');
    return clean ? (clean.startsWith('#') ? clean : '#' + clean) : '#' + groom + bride;
  })();

  useEffect(() => {
    const refreshDay = () => setEventDay(isWeddingDay(cfg.dateISO));
    refreshDay();
    const interval = window.setInterval(refreshDay, 60_000);
    document.addEventListener('visibilitychange', refreshDay);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshDay); };
  }, [cfg.dateISO]);

  useEffect(() => {
    document.title = preview || guest.status === 'valid'
      ? (lang === 'en' ? 'Wedding Invitation ' : 'Undangan Pernikahan ') + coupleShort
      : document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || 'Undangan Pernikahan';
    document.documentElement.lang = lang;
    document.documentElement.classList.add('bl-document');
    return () => document.documentElement.classList.remove('bl-document');
  }, [coupleShort, guest.status, lang, preview]);

  // Deliver any RSVP a previous visit could not send (see lib/outbox.ts).
  useEffect(() => {
    if (preview || guest.status === 'valid') return startOutbox();
  }, [guest.status, preview]);

  // Only a modal locks the page. A short viewport must still reach the cover CTA.
  useEffect(() => {
    document.documentElement.style.overflow = giftOpen ? 'hidden' : '';
    contentRef.current?.toggleAttribute('inert', giftOpen);
    return () => { document.documentElement.style.overflow = ''; };
  }, [giftOpen]);

  useEffect(() => {
    if (closed) return;
    const target = document.getElementById(location.hash.slice(1) || 'hero');
    target?.focus({ preventScroll: true });
    if (location.hash) target?.scrollIntoView({ block: 'start' });
  }, [closed]);

  const toggleLang = () => setLangPick(lang === 'id' ? 'en' : 'id');

  const onOpen = () => {
    window.scrollTo(0, 0);
    setOpening(true);
    setClosed(false);
    window.setTimeout(() => {
      setOpening(false);
      music.start();
    }, 850);
    if (!preview) api.track({ inviteKey: guest.key, event: 'open-invitation' });
  };

  if (!preview && !guest.supplied) {
    return <InvitationState title="Undangan bersifat pribadi" body="Silakan buka tautan pribadi yang dikirimkan oleh pengantin." />;
  }
  if (!preview && (!configReady || guest.status === 'loading')) {
    // Never expose committed placeholder names while the private published
    // config is still crossing the network.
    return <InvitationLoading cfg={cfg} coupleShort="Hanif & Afi" t={t} />;
  }
  if (!preview && guest.supplied && guest.status === 'invalid') {
    return <InvitationState title="Link undangan tidak valid" body="Periksa kembali link yang dikirimkan kepadamu. Token tamu mungkin salah atau sudah tidak aktif." />;
  }
  if (!preview && guest.supplied && guest.status === 'error') {
    return <InvitationState title="Undangan belum dapat dimuat" body="Koneksi ke server sedang terganggu. Coba lagi beberapa saat." retry />;
  }

  return (
    <Assets.Provider value={cfg.assets || {}}>
      <div className="bl-root ig-theatre" style={fontVars(cfg.displayFont, cfg.bodyFont) as CSSProperties}>
        <div className="bl-page">
          {/* Everything below the cover stays unmounted until the guest opens the
              invitation. Rendered eagerly it pulled ~1.3 MB of ornaments on a phone
              that was still looking at the envelope; `loading="lazy"` does not help
              because the cover overlays the content rather than scrolling past it.
              Keeping it unmounted also keeps its controls out of the tab order
              while the cover is up. */}
          {!closed && (<div ref={contentRef} aria-hidden={giftOpen || undefined}>
          <a className="ig-skip-link" href="#couple">{t.skipToContent}</a>
          <main id="invitation-content">
          <Hero cfg={cfg} t={t} />
          <Ticker text={weddingHashtag} />
          <Seam from={SAGE} />
          {showDayCard && <DayCard cfg={cfg} t={t} lang={lang} dateLabel={dateLabel} guest={guest} />}
          <Quote t={t} />
          <Couple cfg={cfg} t={t} />
          <Seam from={PAPER} />
          <EventLocation cfg={cfg} t={t} dateLabel={dateLabel} lang={lang} />
          <Seam from={SAGE} />
          <Story cfg={cfg} t={t} lang={lang} />
          <Seam from={PAPER} />
          <GiftRsvpSection cfg={cfg} t={t} guest={guest} preview={preview} onOpenGift={() => setGiftOpen(true)} />
          <Seam from={SAGE} />
          <Wishes t={t} guest={guest} preview={preview} />
          <Seam from={PAPER} orn />
          <Closing cfg={cfg} t={t} coupleShort={coupleShort} />
          </main>
          <Petals />
          <InvitationNavigation t={t} today={showDayCard} />
          <InvitationPreferences lang={lang} t={t} playing={music.playing} onToggleLang={toggleLang} onToggleMusic={music.toggle} />
          </div>)}

          {music.ytSrc && (
            <div className="bl-clip" style={{ position: 'fixed', width: 1, height: 1, left: -10, bottom: 0, opacity: .01, pointerEvents: 'none' }}>
              {/* Load before the cover opens. iOS/Samsung allow a play command
                  from the guest's tap much more reliably than a new autoplaying iframe. */}
              <iframe ref={music.setYtFrame} src={music.ytSrc} title="Musik latar" allow="autoplay; encrypted-media" style={{ width: 240, height: 240, border: 0 }}
                onLoad={e => music.onYtLoad(e.currentTarget)} />
            </div>
          )}

          {giftOpen && <GiftSheet cfg={cfg} t={t} lang={lang} onClose={() => setGiftOpen(false)} />}

          {closed && (<main id="cover-content">
            <Cover t={t} guestName={guest.name}
              langLabel={lang === 'id' ? 'EN' : 'ID'} onOpen={onOpen}
              onStart={music.prepare} onToggleLang={toggleLang} />
          </main>)}

          {opening && (
            <div className="bl-col bl-screen ig-opening" style={{ zIndex: 85, pointerEvents: 'none' }}>
              <div className="ig-opening-paper ig-opening-paper-left" aria-hidden="true" />
              <div className="ig-opening-paper ig-opening-paper-right" aria-hidden="true" />
              <div className="ig-opening-seam" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </Assets.Provider>
  );
}

function InvitationLoading({ cfg, coupleShort, t }: { cfg: WeddingConfig; coupleShort: string; t: Copy }) {
  return (
    <main className="app-min-screen bl-root bl-wedding-loader bl-gilded" role="status" aria-label="Menyiapkan undangan"
      style={fontVars(cfg.displayFont, cfg.bodyFont) as CSSProperties}>
      <div className="bl-loader-halo" aria-hidden="true"><span /></div>
      <div className="bl-loader-copy">
        <div className="bl-loader-kicker">{t.weddingOf}</div>
        <div className="bl-display bl-loader-names">{coupleShort}</div>
        <div className="bl-loader-dots" aria-hidden="true">
          {[0, 1, 2, 3].map(index => <span key={index} style={{ animationDelay: index * 140 + 'ms' }} />)}
        </div>
      </div>
    </main>
  );
}

function InvitationState({ title, body, retry = false }: { title: string; body: string; retry?: boolean }) {
  return (
    <main className="app-min-screen" style={{ display: 'grid', placeItems: 'center', padding: 28, background: PAPER, color: INK, textAlign: 'center', fontFamily: 'system-ui' }}>
      <div style={{ boxSizing: 'border-box', width: '100%', maxWidth: 390, padding: '38px 28px', borderRadius: 24, background: CARD, border: '1px solid rgba(104,111,77,.18)', boxShadow: '0 24px 70px rgba(62,53,44,.12)' }}>
        <div aria-hidden="true" style={{ width: 9, height: 9, margin: '0 auto 19px', borderRadius: '50%', background: GOLD, boxShadow: '0 0 0 7px rgba(201,161,93,.12), 0 0 24px rgba(201,161,93,.7)' }} />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{title}</h1>
        <p role="status" style={{ margin: '12px auto 0', maxWidth: 310, fontSize: 14, lineHeight: 1.7, opacity: .72 }}>{body}</p>
        {retry && <button type="button" className="bl-btn" onClick={() => location.reload()} style={{ marginTop: 22, padding: '12px 22px', background: SAGE, color: CARD }}>Coba lagi</button>}
      </div>
    </main>
  );
}

/* ---------- sections ---------- */

type S = { cfg: WeddingConfig; t: Copy };

function InvitationPreferences({ lang, t, playing, onToggleLang, onToggleMusic }: {
  lang: Lang; t: Copy; playing: boolean; onToggleLang: () => void; onToggleMusic: () => void;
}) {
  return (
    <div className="ig-corner-controls" role="group" aria-label={lang === 'en' ? 'Language and music' : 'Bahasa dan musik'}>
      <button className="bl-icon-btn" type="button" onClick={onToggleLang} aria-label={lang === 'id' ? 'Read in English' : 'Baca dalam Bahasa Indonesia'}>{lang === 'id' ? 'EN' : 'ID'}</button>
      <button className="bl-icon-btn" type="button" onClick={onToggleMusic} aria-label={playing ? t.musicOn : t.musicOff} aria-pressed={playing}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {playing ? <path d="M9 5v14M15 5v14" /> : <><path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></>}
        </svg>
      </button>
    </div>
  );
}

function Petals() {
  const petalsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => petalsRef.current?.classList.toggle('is-animating', !document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  const petals = [
    { slot: 'petal-a', left: 8, size: 17, duration: 13, delay: -2, drift: 28 },
    { slot: 'petal-c', left: 23, size: 13, duration: 16, delay: -10, drift: -22 },
    { slot: 'petal-e', left: 39, size: 19, duration: 12, delay: -6, drift: 35 },
    { slot: 'petal-b', left: 56, size: 14, duration: 15, delay: -1, drift: -25 },
    { slot: 'petal-d', left: 73, size: 16, duration: 14, delay: -9, drift: 22 },
    { slot: 'petal-a', left: 90, size: 18, duration: 17, delay: -13, drift: -32 },
  ];
  return (
    <div ref={petalsRef} className="ig-petals" aria-hidden="true">
      {petals.map((petal, i) => (
        <div key={i} className="ig-petal-flight" style={{ left: petal.left + '%', width: petal.size, height: petal.size, animationDuration: petal.duration + 's', animationDelay: petal.delay + 's', '--petal-drift': petal.drift + 'px' } as CSSProperties}>
          <Orn slot={petal.slot} eager style={{ inset: 0, width: '100%', height: '100%' }} />
        </div>
      ))}
    </div>
  );
}

function Cover({ t, guestName, langLabel, onOpen, onStart, onToggleLang }: {
  t: Copy; guestName: string; langLabel: string;
  onOpen: () => void; onStart: () => void; onToggleLang: () => void;
}) {
  const assets = useContext(Assets);
  const [playing, setPlaying] = useState(false);
  const start = () => {
    if (playing) return;
    onStart();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onOpen(); return; }
    setPlaying(true);
  };
  return (
    <div className="ig-cover">
      <Orn slot="v-theatre-garden" className="ig-cover-garden" style={{ inset: 0, width: '100%', height: '100%' }} eager />
      <div className="ig-cover-content">
        <Monogram className="ig-cover-monogram" />
        <div className="ig-cover-copy">
          <h1 className="ig-cover-kicker">{t.coverKicker}</h1>
        </div>
        <div className="ig-cover-envelope">
          <EnvelopePlayback playing={playing} poster={slotSrc(assets, 'v-envelope-closed')} onComplete={onOpen} />
        </div>
        <div className="ig-envelope-addressee">
          <span>{t.guestGreeting}</span>
          <strong>{guestName || t.guestDefault}</strong>
        </div>
        <button className="bl-btn ig-cover-button" onClick={start} disabled={playing} aria-busy={playing}>{t.openInvite}</button>
        <div className="ig-cover-rule" aria-hidden="true"><span /></div>
      </div>
      <div className="ig-corner-controls"><button type="button" className="bl-icon-btn" onClick={onToggleLang} aria-label={langLabel === 'EN' ? 'Read in English' : 'Baca dalam Bahasa Indonesia'}>{langLabel}</button></div>
    </div>
  );
}

function Hero({ cfg, t }: S) {
  const heroRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (heroRef.current) return lockHeroLayout(heroRef.current);
  }, []);
  return (
    <section ref={heroRef} id="hero" tabIndex={-1} className="bl-sec ig-hero" data-screen-label="Hero">
      <Orn slot="v-theatre-garden" priority className="ig-theatre-backdrop" style={{ inset: 0, width: '100%', height: '100%' }} />
      <div className="ig-hero-title">
        <div className="ig-hero-kicker">{t.weddingOf}</div>
        <h1 className="bl-display bl-couple-name" aria-label={`${cfg.groomName} ${t.and} ${cfg.brideName}`}>
          <strong>{cfg.groomName}</strong>
          <span>&</span>
          <strong>{cfg.brideName}</strong>
        </h1>
        <time className="ig-hero-date" dateTime={cfg.dateISO}>{t.and === 'and' ? cfg.dateLabelEn || cfg.dateLabel : cfg.dateLabel}</time>
      </div>
      <Orn slot="v-couple-illustration" priority className="ig-hero-couple" style={{ left: '50%', translate: '-50% 0' }} />
      <ScrollCue label={t.readInvitation} />
    </section>
  );
}

function ScrollCue({ label }: { label: string }) {
  const cueRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const cue = cueRef.current;
    if (!cue) return;
    let visible = false;
    const sync = () => cue.classList.toggle('is-animating', visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(cue);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return (
    <a ref={cueRef} className="ig-hero-invite" href="#couple" aria-label={label}>
      <svg className="ig-scroll-cue" width="24" height="60" viewBox="0 0 24 60" fill="currentColor" aria-hidden="true">
        <path d="M12 2C11.9 12 11.15 18 11.15 25S11.9 39 12 44C12.1 39 12.85 32 12.85 25S12.1 12 12 2Z" />
        <circle cx="12" cy="52" r="3" />
      </svg>
    </a>
  );
}

function Ticker({ text }: { text: string }) {
  return <div className="ig-ribbon-band"><span aria-hidden="true" /><span>{text}</span><span aria-hidden="true" /></div>;
}

function Quote({ t }: { t: Copy }) {
  return (
    <section className="bl-sec ig-quote" data-screen-label="Quote" aria-label={t.quoteSource}>
      <Orn slot="ig-bouquet" className="ig-quote-bouquet" style={{ left: '50%', translate: '-50% 0', width: 136, height: 136 }} />
      <div className="ig-quote-paper">
        <Kicker>{t.quoteSource}</Kicker>
        <blockquote>{t.quote}</blockquote>
      </div>
    </section>
  );
}

function Couple({ cfg, t }: S) {
  const people = [
    { key: 'groom', photo: 'v-groom', fallback: 'v-groom-illustration', name: cfg.groomFull, role: t.sonOf, parents: cfg.groomParents, instagram: cfg.groomInstagram },
    { key: 'bride', photo: 'v-bride', fallback: 'v-bride-illustration', name: cfg.brideFull, role: t.daughterOf, parents: cfg.brideParents, instagram: cfg.brideInstagram }
  ];
  return (
    <section id="couple" tabIndex={-1} className="bl-sec ig-couple-section" data-screen-label="Mempelai">
      <Orn slot="ig-floral-swag" className="ig-couple-swag" style={{ left: '50%', top: 8, translate: '-50% 0', width: 210, height: 110 }} />
      <div className="ig-section-heading">
        <Kicker>{t.coupleKicker}</Kicker>
        <h2 className="ig-editorial-title">{t.coupleTitle}</h2>
        <p className="bl-batang">{t.coupleIntro}</p>
      </div>
      <div className="ig-portrait-grid">
        {people.map(person => (
          <article key={person.key} className={'ig-portrait-card ig-person-' + person.key}>
            <div className={'ig-portrait-art ig-portrait-' + person.key}>
              <div className="ig-portrait-window">
                <PortraitMedia photoSlot={person.photo} fallbackSlot={person.fallback} alt={person.name} />
              </div>
            </div>
            <div className="ig-portrait-copy">
              <h3 className="bl-full-name">{person.name}</h3>
              <div className="ig-portrait-role">{person.role}</div>
              <div className="ig-portrait-parents">{person.parents}</div>
              <IgButton handle={person.instagram} align="left" />
            </div>
          </article>
        ))}
      </div>
      <div className="ig-couple-divider" aria-hidden="true">
        <span /><Orn slot="ig-rose" style={{ inset: 0, width: '100%', height: '100%' }} /><span />
      </div>
    </section>
  );
}

function DayCard({ cfg, t, lang, dateLabel, guest }: S & { lang: Lang; dateLabel: string; guest: GuestInfo }) {
  const [copied, setCopied] = useState(false);
  const parking = lang === 'en' ? cfg.dayParkingEn || cfg.dayParking : cfg.dayParking;
  const address = cfg.address?.trim() || [cfg.venue, cfg.city].filter(Boolean).join(', ');
  const mapQuery = cfg.mapsQuery || address;
  const phone = cfg.dayContactPhone.replace(/[^+\d]/g, '');
  return (
    <section id="today" tabIndex={-1} className="bl-sec bl-day-section" data-screen-label="Hari Ini" aria-label={t.todayKicker}>
      <div className="bl-day-card bl-reveal-card">
        <Kicker>{t.todayKicker}</Kicker>
        <h2 className="bl-display bl-day-title">{t.todayTitle}</h2>
        <p className="bl-day-date">{dateLabel}</p>
        <div className="bl-day-times">
          <div><span>{t.akadName}</span><strong>{cfg.akadTime}</strong></div>
          <div><span>{t.resepsiName}</span><strong>{cfg.resepsiTime}</strong></div>
        </div>
        <div className="bl-day-info">
          <span className="bl-day-label">{t.todayAddress}</span>
          <strong>{cfg.venue}</strong>
          <p>{address}</p>
          <div className="bl-day-actions">
            <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery)} target="_blank" rel="noopener noreferrer">{t.todayMap}</a>
            <button type="button" onClick={async () => { if (await copyText(address)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); } }}>{copied ? t.copied : t.todayCopy}</button>
          </div>
        </div>
        {(parking || cfg.dayContactName || phone) && <div className="bl-day-extra">
          {parking && <div><span className="bl-day-label">{t.todayParking}</span><p>{parking}</p></div>}
          {(cfg.dayContactName || phone) && <div><span className="bl-day-label">{t.todayContact}</span><p>{cfg.dayContactName}{cfg.dayContactName && phone ? ' · ' : ''}{phone && <a href={'tel:' + phone}>{cfg.dayContactPhone}</a>}</p></div>}
        </div>}
        {guest.rsvp === 'yes' && guest.id && <div className="bl-day-qr">
          <QRCodeCanvas value={location.origin + '/checkin?g=' + encodeURIComponent(guest.id)} size={116} marginSize={1} fgColor={DEEP} bgColor={CARD} />
          <div><strong>{t.qrTitle}</strong><p>{t.qrNote}</p></div>
        </div>}
      </div>
    </section>
  );
}

function Countdown({ iso, t }: { iso: string; t: Copy }) {
  const calc = () => {
    let ms = safeDate(iso).getTime() - Date.now();
    if (ms < 0) ms = 0;
    return { d: two(Math.floor(ms / 86400000)), h: two(Math.floor(ms / 3600000) % 24), m: two(Math.floor(ms / 60000) % 60), s: two(Math.floor(ms / 1000) % 60) };
  };
  const [cd, setCd] = useState(calc);
  useEffect(() => {
    setCd(calc());
    const id = window.setInterval(() => setCd(calc()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  const cells = [[cd.d, t.days], [cd.h, t.hours], [cd.m, t.minutes], [cd.s, t.seconds]];
  return (
    <div className="ig-countdown-note"><div className="ig-countdown-paper">
      <p className="ig-countdown-caption">{t.countdownTitle}</p>
    <div className="ig-countdown" role="timer" aria-live="off" aria-label={t.countdownTitle}>
      {cells.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong><span>{label}</span>
        </div>
      ))}
    </div></div></div>
  );
}

function EventLocation({ cfg, t, dateLabel, lang }: S & { dateLabel: string; lang: Lang }) {
  return (
    <section id="events" tabIndex={-1} className="bl-sec ig-events" data-screen-label="Acara">
      <Events cfg={cfg} t={t} dateLabel={dateLabel} lang={lang} />
      <Location cfg={cfg} t={t} />
    </section>
  );
}

function Events({ cfg, t, dateLabel, lang }: S & { dateLabel: string; lang: Lang }) {
  const dt = safeDate(cfg.dateISO);
  const q = encodeURIComponent(cfg.mapsQuery || cfg.venue + ', ' + cfg.city);
  const cal = (d: Date) => d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + 'T' + two(d.getUTCHours()) + two(d.getUTCMinutes()) + '00Z';
  const title = t.calendarTitle + cfg.groomName + ' & ' + cfg.brideName;
  const atCeremonyTime = (time: string) => {
    const clock = time.match(/^(\d{1,2})[.:](\d{2})/);
    const iso = cfg.dateISO.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?([+-]\d{2}:\d{2}|Z)?$/);
    if (!clock || !iso) return dt;
    const candidate = new Date(`${iso[1]}T${two(Number(clock[1]))}:${clock[2]}:00${iso[2] || ''}`);
    return isNaN(candidate.getTime()) ? dt : candidate;
  };
  const start = atCeremonyTime(cfg.akadTime);
  const reception = atCeremonyTime(cfg.resepsiTime);
  const end = new Date(Math.max(start.getTime() + 5 * 3600000, reception.getTime() + 3 * 3600000));
  const calendarHref = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' +
    encodeURIComponent(title) +
    '&dates=' + cal(start) + '/' + cal(end) + '&location=' + q;
  const a = splitTime(cfg.akadTime), r = splitTime(cfg.resepsiTime);
  const ceremony = (order: string, label: string, name: string, time: { hour: string; zone: string }) => (
    <div className="ig-ceremony">
      <span className="ig-ceremony-order" aria-hidden="true">{order}</span>
      <div>
        <span className="ig-ceremony-label">{label}</span>
        <h3>{name}</h3>
        <p className="ig-ceremony-time">{time.hour} <span>{time.zone}</span></p>
      </div>
    </div>
  );

  return (
    <div className="ig-events-content">
      <Orn slot="ig-floral-swag" className="ig-event-florals" style={{ left: '50%', top: 4, translate: '-50% 0', width: '84%', height: 150 }} />
      <div className="ig-section-heading">
        <Kicker color={CARD}>{t.eventKicker}</Kicker>
        <h2 className="ig-editorial-title">{t.eventTitle}</h2>
      </div>
      <Countdown iso={cfg.dateISO} t={t} />
      <div className="ig-agenda">
        <time dateTime={cfg.dateISO} aria-label={dateLabel} className="ig-agenda-date">
          <span>{dt.toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' })}</span>
          <strong>{dt.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'Asia/Jakarta' })}</strong>
          <span className="ig-date-context"><span>{dt.toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { month: 'long', timeZone: 'Asia/Jakarta' })}</span><span className="ig-date-year">{dt.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Jakarta' })}</span></span>
        </time>
        {ceremony('I', t.akadLabel, t.akadName, a)}
        {ceremony('II', t.resepsiLabel, t.resepsiName, r)}
        <div className="ig-agenda-venue">
          <h3>{cfg.venue}</h3><p>{cfg.city}</p>
          <a className="bl-btn ig-primary-action" href={'https://www.google.com/maps/search/?api=1&query=' + q} target="_blank" rel="noopener noreferrer">{t.todayMap}</a>
          <a href={calendarHref} target="_blank" rel="noopener noreferrer" className="ig-text-action">{t.saveDate}</a>
        </div>
      </div>
    </div>
  );
}

function Story({ cfg, t, lang }: S & { lang: Lang }) {
  const c = cfg as unknown as Record<string, string>;
  const englishFallback = [
    { title: 'First Meeting', body: 'One campus project brought together two people who did not yet know it was the beginning of everything.' },
    { title: 'Walking Together', body: 'Solo and Jakarta taught us the meaning of waiting and choosing one another with intention.' },
    { title: 'The Proposal', body: 'In a garden filled with flowers, one question was answered with one word.' },
    { title: 'Our Wedding Day', body: 'The same ribbon now binds two families together as one.' }
  ];
  const orns = ['orn-story-1', 'orn-story-2', 'orn-story-3', 'orn-story-4'];
  const chapters = [1, 2, 3, 4]
    .map(n => {
      const titleId = c['story' + n + 'Title'];
      const bodyId = c['story' + n + 'Body'];
      return {
        n,
        year: c['story' + n + 'Year'],
        title: lang === 'en' ? c['story' + n + 'TitleEn'] || englishFallback[n - 1].title : titleId,
        body: lang === 'en' ? c['story' + n + 'BodyEn'] || englishFallback[n - 1].body : bodyId
      };
    })
    .filter(ch => ch.title || ch.body);
  const threadRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = threadRef.current;
    if (!root) return;
    const chapters = Array.from(root.querySelectorAll<HTMLElement>('.ig-chapter'));
    const align = () => {
      const height = root.clientHeight;
      if (!height) return;
      chapters.forEach(chapter => {
        const y = chapter.offsetTop + chapter.clientTop + 30;
        const sample = Math.max(0, Math.min(y / height * THREAD.height / 10, THREAD_X.length - 1));
        const i = Math.floor(sample), fraction = sample - i;
        const a = THREAD_X[i] ?? THREAD_X[i + 1] ?? 0;
        const b = THREAD_X[i + 1] ?? a;
        // Match the original thread's sampled center line at its rendered scale.
        const x = -10 + 86 / 2 + (a + (b - a) * fraction) * 86 / THREAD.width;
        chapter.style.setProperty('--thread-pin-x', `${x - chapter.offsetLeft - chapter.clientLeft}px`);
      });
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(root);
    chapters.forEach(chapter => observer.observe(chapter));
    return () => observer.disconnect();
  }, [chapters.length]);
  if (!chapters.length) return null;
  return (
    <section id="story" tabIndex={-1} className="bl-sec ig-story" data-screen-label="Story">
      <div className="ig-section-heading">
        <Kicker>{t.storyKicker}</Kicker>
        <h2 className="ig-editorial-title">{t.storyTitle}</h2>
        <p>{t.storySub}</p>
      </div>
      <div ref={threadRef} className="ig-story-chapters">
        <img className="ig-story-thread" src={RIBBON} alt="" width="180" height="980" loading="lazy" />
        {chapters.map(ch => (
          <article key={ch.n} className="ig-chapter">
            <span className="ig-chapter-pin" aria-hidden="true" />
            {ch.year && <span className="ig-chapter-year">{ch.year}</span>}
            <h3>{ch.title}</h3><p>{ch.body}</p>
            <Orn slot={orns[ch.n - 1]} style={{ right: -6, bottom: -18, width: 76, height: 64 }} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Location({ cfg, t }: S) {
  const q = encodeURIComponent(cfg.mapsQuery || cfg.venue + ', ' + cfg.city);
  return (
    <div className="ig-location">
      <Kicker color={CARD}>{t.locKicker}</Kicker>
      <p>{cfg.address || [cfg.venue, cfg.city].filter(Boolean).join(', ')}</p>
      <div className="ig-map-frame">
        <iframe src={'https://maps.google.com/maps?q=' + q + '&z=15&output=embed'} title={t.locKicker} width="480" height="240" style={{ width: '100%', height: '100%', border: 0 }} loading="lazy" referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}

type GuestInfo = { id: string; key: string; name: string; status: string; rsvp: 'yes' | 'no' | null; guests: number };

function GiftRsvpSection({ cfg, t, guest, preview, onOpenGift }: S & {
  guest: GuestInfo; preview: boolean; onOpenGift: () => void;
}) {
  const hasGift = !!(cfg.bank1Acct || cfg.bank2Acct || cfg.giftAddress);
  return (
    <section id="rsvp" tabIndex={-1} className="bl-sec ig-reply-section" data-screen-label="RSVP">
      <Rsvp t={t} guest={guest} preview={preview} />
      {hasGift && <GiftSection cfg={cfg} t={t} onOpen={onOpenGift} />}
    </section>
  );
}

/** Keep a "Nama kamu" field in step with the invited guest's name (from the
    link, then the guest list) until the guest types something themselves. */
function useAutoName(guestName: string, value: string, set: (v: string) => void, locked: boolean) {
  const last = useRef(guestName);
  useEffect(() => {
    if (!locked && guestName && (value === '' || value === last.current)) set(guestName);
    last.current = guestName;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestName]);
}
type RsvpSaved = { name: string; attend: 'yes' | 'no'; guests: number };

function Rsvp({ t, guest, preview }: { t: Copy; guest: GuestInfo; preview: boolean }) {
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const key = 'rsvp:' + (guest.key || 'preview');
  const saved = useMemo<RsvpSaved | null>(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }, [key]);
  const [name, setName] = useState(preview ? saved?.name || guest.name : guest.name);
  useAutoName(guest.name, name, setName, !!saved && preview);
  const [attend, setAttend] = useState<'yes' | 'no' | null>(preview ? saved?.attend || null : guest.rsvp);
  // One invitation may confirm no more than two people. Clamp old local values
  // too, so an answer saved before this limit cannot be re-submitted above it.
  const [guests, setGuests] = useState(() => Math.min(2, Math.max(1, (preview ? saved?.guests : guest.guests) || 1)));
  const [done, setDone] = useState(preview ? !!saved : !!guest.rsvp);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Separate from `err`: only a failed send is worth offering a retry for,
  // a missing name is not.
  const [failed, setFailed] = useState(false);
  const previousDone = useRef(done);

  useEffect(() => {
    if (previousDone.current !== done) {
      (done ? resultRef.current : nameRef.current)?.focus({ preventScroll: true });
    }
    previousDone.current = done;
  }, [done]);

  useEffect(() => {
    if (preview || guest.status !== 'valid') return;
    if (guest.rsvp) {
      setAttend(guest.rsvp);
      setGuests(Math.min(2, Math.max(1, guest.guests || 1)));
      setName(guest.name);
      setDone(true);
    } else {
      setDone(false);
    }
  }, [guest.guests, guest.name, guest.rsvp, guest.status, preview]);

  const submit = async () => {
    if (!name.trim()) return setErr(t.needName);
    if (!attend) return setErr(t.pickAttend);
    if (!preview && !guest.key) return setErr(t.needInvite);
    setErr(''); setFailed(false); setBusy(true);
    try {
      if (!preview && backendReady) {
        await api.rsvp({ inviteKey: guest.key, name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
        clearQueuedRsvp(guest.key);
      }
      const rec: RsvpSaved = { name: name.trim(), attend, guests };
      try { localStorage.setItem(key, JSON.stringify(rec)); } catch { /* ignore */ }
      setDone(true);
      if (!preview && backendReady) window.dispatchEvent(new CustomEvent('wedding-rsvp-synced', { detail: guest.key }));
    } catch {
      // Park it so the answer is not lost if this guest never comes back to retry.
      if (!preview && backendReady) {
        queueRsvp({ key, inviteKey: guest.key, name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
      }
      setErr(t.sendFailed);
      setFailed(true);
    } finally { setBusy(false); }
  };

  return (
    <div className="ig-reply">
      <Orn slot="ig-floral-swag" className="ig-reply-flowers" style={{ left: '50%', translate: '-50% 0', width: 220, height: 108 }} />
      <div className="ig-reply-paper">
        <div className="ig-form-heading">
          <Kicker>{t.replyKicker}</Kicker>
          <h2 className="ig-editorial-title">{t.rsvpTitle}</h2>
          <p>{t.rsvpSub}</p>
        </div>
        {!done ? (
          <form className="ig-rsvp-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
            <div className="ig-field-group">
              <label htmlFor={formId + '-name'}>{t.nameLabel}</label>
              <input ref={nameRef} id={formId + '-name'} className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} autoComplete="name" required aria-invalid={!!err && !name.trim()} aria-describedby={err ? formId + '-error' : undefined} />
            </div>
            <fieldset className="ig-attendance" aria-describedby={err ? formId + '-error' : undefined}>
              <legend>{t.attendanceLabel}</legend>
              <div>
                <button type="button" className="ig-rsvp-choice" onClick={() => setAttend('yes')} aria-pressed={attend === 'yes'}><span aria-hidden="true">{attend === 'yes' ? '✓' : '○'}</span>{t.attend}</button>
                <button type="button" className="ig-rsvp-choice" onClick={() => setAttend('no')} aria-pressed={attend === 'no'}><span aria-hidden="true">{attend === 'no' ? '✓' : '○'}</span>{t.notAttend}</button>
              </div>
            </fieldset>
            {attend !== 'no' && (
              <div className="ig-guest-stepper">
                <div><span id={formId + '-count-label'}>{t.guestCount}</span><small id={formId + '-count-help'}>{t.guestHelp}</small></div>
                <div className="ig-stepper" role="group" aria-labelledby={formId + '-count-label'} aria-describedby={formId + '-count-help'}>
                  <button type="button" onClick={() => setGuests(g => Math.max(1, g - 1))} disabled={guests <= 1} aria-label={t.decreaseGuests}>&minus;</button>
                  <output aria-live="polite">{guests}</output>
                  <button type="button" onClick={() => setGuests(g => Math.min(2, g + 1))} disabled={guests >= 2} aria-label={t.increaseGuests}>+</button>
                </div>
              </div>
            )}
            {err && (
              <div id={formId + '-error'} className="bl-msg" role="alert">
                {err}
                {failed && (
                  <button type="button" className="ig-text-action" onClick={submit} disabled={busy}>
                    {t.retry}
                  </button>
                )}
              </div>
            )}
            <button type="submit" className="bl-btn ig-primary-action" disabled={busy}>{busy ? t.sending : t.sendRsvp}</button>
          </form>
        ) : (
          <div ref={resultRef} tabIndex={-1} className="ig-rsvp-result" role="status" aria-live="polite">
            <div style={{ position: 'relative', width: 68, height: 68, margin: '0 auto 8px' }}>
              <Orn slot="orn-rsvp-done" style={{ inset: 0, width: '100%', height: '100%' }} />
            </div>
            <h3 className="ig-result-title">{t.thanks} {name}</h3>
            <p>
              {attend === 'no' ? t.wontAttend : t.willAttend.replace('{n}', String(guests))}
            </p>
            {attend === 'yes' && guest.id && (
              <div style={{ margin: '18px auto 0', padding: '16px 16px 12px', width: 'max-content', background: PAPER, border: '1px solid rgba(104,111,77,.14)', borderRadius: 16 }}>
                <div className="bl-kicker" style={{ marginBottom: 10 }}>{t.qrTitle}</div>
                <QRCodeCanvas value={location.origin + '/checkin?g=' + encodeURIComponent(guest.id)} size={132} marginSize={1} fgColor={DEEP} bgColor={PAPER} />
                <div style={{ marginTop: 8, maxWidth: 150, font: "400 10.5px/1.5 var(--f-body)", opacity: .7 }}>{t.qrNote}</div>
              </div>
            )}
            <button className="bl-btn ig-secondary-action" onClick={() => setDone(false)}>{t.change}</button>
          </div>
        )}
      </div>
    </div>
  );
}

type WishView = { id: string; name: string; text: string; createdAt: string; mine?: boolean };

function Wishes({ t, guest, preview }: { t: Copy; guest: GuestInfo; preview: boolean }) {
  const formId = useId();
  const [list, setList] = useState<WishView[]>([]);
  const [loading, setLoading] = useState(!preview && backendReady && !!guest.key);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState(guest.name);
  useAutoName(guest.name, name, setName, false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const noteTimer = useRef<number | undefined>(undefined);
  const requestId = useRef('');

  useEffect(() => {
    if (!backendReady || preview || !guest.key) return;
    let alive = true;
    setLoading(true);
    setLoadError(false);
    const load = () => api.listWishes(false, guest.key)
      .then(ws => { if (alive) { setList(ws.map(w => ({ id: w.id, name: w.name, text: w.text, createdAt: w.createdAt }))); setLoadError(false); } })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    load();
    const loadStatus = () => api.wishStatus(guest.key)
      .then(status => { if (alive) setSentCount(status.sentCount); })
      .catch(() => { /* The submit endpoint still enforces the allowance. */ });
    loadStatus();
    // New wishes are public immediately, so the wall also refreshes for guests
    // who leave the invitation open while others send their messages.
    const timer = window.setInterval(() => { void load(); void loadStatus(); }, 25000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [guest.key, preview, reload]);

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  const submit = async () => {
    if (submitting.current) return;
    const n = name.trim(), w = text.trim();
    window.clearTimeout(noteTimer.current);
    if (sentCount >= 2) { setNoteError(true); setNote(t.wishLimit); return; }
    if (!n || !w) { setNoteError(true); setNote(!n ? t.needName : t.needWish); return; }
    if (!preview && !guest.key) { setNoteError(true); setNote(t.needInvite); return; }
    if (!requestId.current) {
      if (typeof crypto.randomUUID === 'function') requestId.current = crypto.randomUUID();
      else {
        const random = new Uint32Array(4);
        crypto.getRandomValues(random);
        requestId.current = Array.from(random, value => value.toString(36)).join('-');
      }
    }
    const mine: WishView = { id: 'local-' + Date.now(), name: n, text: w, createdAt: new Date().toISOString(), mine: true };
    submitting.current = true;
    setBusy(true);
    setNote('');
    setNoteError(false);
    try {
      const saved = !preview && backendReady
        ? await api.addWish({ name: n, text: w, inviteKey: guest.key, requestId: requestId.current })
        : null;
      const posted = saved?.id ? { ...mine, id: saved.id } : mine;
      // A retry may return the id of a row that already reached the periodic
      // feed. Replace it instead of briefly rendering the same wish twice.
      setList(list => [posted, ...list.filter(item => item.id !== posted.id)]);
      setPage(0);
      setSentCount(count => Math.min(2, count + 1));
      if (!preview && backendReady) void api.wishStatus(guest.key).then(status => setSentCount(status.sentCount)).catch(() => {});
      setText('');
      requestId.current = '';
      setNote(backendReady && !preview ? t.wishPending : t.wishPreviewSent);
      noteTimer.current = window.setTimeout(() => setNote(''), 5000);
    } catch (error) {
      setNoteError(true);
      const message = error instanceof Error ? error.message : '';
      if (message === 'wish_limit_reached') {
        setSentCount(2);
        setNote(t.wishLimit);
      } else setNote(message === 'rate_limit_reached' ? t.wishRateLimit : t.sendFailed);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(list.length / 4));
  const currentPage = Math.min(page, pages - 1);
  const changePage = (next: number) => {
    setPage(next);
    listRef.current?.focus({ preventScroll: true });
  };

  return (
    <section className="bl-sec ig-wishes" data-screen-label="Ucapan">
      <div>
        <div className="ig-section-heading">
          <Kicker>{t.wishKicker}</Kicker>
          <h2 className="ig-editorial-title">{t.wishTitle}</h2>
          <p>{t.wishSub}</p>
        </div>
        {preview && <p className="ig-preview-note">{t.wishesPreview}</p>}
        <form className="ig-wish-form" noValidate aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
          <p id={formId + '-allowance'} className="ig-wish-allowance" role={sentCount >= 2 ? 'status' : undefined}>{sentCount >= 2 ? t.wishLimit : t.wishAllowance}</p>
          <label htmlFor={formId + '-name'}>{t.nameLabel}</label>
          <input id={formId + '-name'} className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} autoComplete="name" required aria-invalid={noteError && !name.trim()} aria-describedby={note ? formId + '-note' : undefined} />
          <label htmlFor={formId + '-wish'}>{t.wishKicker}</label>
          <textarea id={formId + '-wish'} className="bl-field" value={text} onChange={e => { setText(e.target.value); requestId.current = ''; }} rows={4} placeholder={t.wishPh} maxLength={600} required aria-invalid={noteError && !text.trim()} aria-describedby={note ? formId + '-note' : undefined} />
          {note && <div id={formId + '-note'} className={'bl-msg ' + (noteError ? 'is-error' : '')} role={noteError ? 'alert' : 'status'}>{note}</div>}
          <button type="submit" className="bl-btn ig-primary-action" disabled={busy || sentCount >= 2} aria-describedby={formId + '-allowance'}>{busy ? t.sending : t.sendWish}</button>
        </form>
        <div ref={listRef} tabIndex={-1} role="region" aria-label={t.wishKicker} className="ig-wish-list" aria-busy={loading}>
          {loading && <p className="ig-feed-state" role="status">{t.wishesLoading}</p>}
          {loadError && <div className="ig-feed-state" role="alert"><p>{t.wishesError}</p><button className="ig-text-action" onClick={() => setReload(value => value + 1)}>{t.retry}</button></div>}
          {!loading && !loadError && !list.length && <p className="ig-feed-state">{t.wishesEmpty}</p>}
          {list.slice(currentPage * 4, currentPage * 4 + 4).map(w => (
            <article key={w.id} className="ig-wish-note">
              <div className="ig-wish-meta">
                <h3>{w.name}</h3>
                <time dateTime={w.createdAt}>{fmtWhen(w.createdAt, t)}</time>
              </div>
              <p>{w.text}</p>
            </article>
          ))}
        </div>
        {pages > 1 && <nav className="ig-wish-pagination" aria-label={t.wishPagination}>
          <button type="button" className="bl-btn ig-secondary-action" aria-label={t.wishPrevious} title={t.wishPrevious} disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <span role="status">{t.wishPages.replace('{page}', String(currentPage + 1)).replace('{total}', String(pages))}</span>
          <button type="button" className="bl-btn ig-secondary-action" aria-label={t.wishNext} title={t.wishNext} disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
          </button>
        </nav>}
      </div>
    </section>
  );
}

function giftCards(cfg: WeddingConfig, t: Copy, lang: Lang) {
  const cards: { key: string; slot: string; label: string; kind: string; value: string; holder: string; bg: string; fg: string; btnBg: string; btnFg: string; size: number; copyLabel: string }[] = [];
  if (cfg.bank1Acct) cards.push({ key: 'b1', slot: 'orn-gift-1', label: cfg.bank1Name || 'Bank', kind: t.transfer, value: cfg.bank1Acct, holder: cfg.bank1Holder ? t.holderPrefix + cfg.bank1Holder : '', bg: 'linear-gradient(155deg,' + SAGE + ',' + DEEP + ')', fg: PAPER, btnBg: GOLD, btnFg: DEEP, size: 27, copyLabel: t.copy });
  if (cfg.bank2Acct) cards.push({ key: 'b2', slot: 'orn-gift-2', label: cfg.bank2Name || 'Bank', kind: t.transfer, value: cfg.bank2Acct, holder: cfg.bank2Holder ? t.holderPrefix + cfg.bank2Holder : '', bg: 'linear-gradient(155deg,#B88974,' + RED + ')', fg: CARD, btnBg: CARD, btnFg: RED, size: 27, copyLabel: t.copy });
  if (cfg.giftAddress) cards.push({ key: 'addr', slot: 'orn-gift-3', label: lang === 'en' ? 'Send a Gift' : cfg.giftAddressLabel || 'Kirim Hadiah', kind: t.addressKind, value: cfg.giftAddress, holder: cfg.giftAddressHolder, bg: CARD, fg: INK, btnBg: RED, btnFg: CARD, size: 17, copyLabel: t.copyAddr });
  return cards;
}

function GiftSection({ cfg, t, onOpen }: S & { onOpen: () => void }) {
  if (!cfg.bank1Acct && !cfg.bank2Acct && !cfg.giftAddress) return null;
  return (
    <div className="ig-gift">
      <Orn slot="v-envelope-open" className="ig-gift-envelope" style={{ width: 128, height: 128 }} />
      <div className="ig-gift-copy">
        <h2 className="ig-editorial-title">{t.giftTitle}</h2>
        <p>{t.giftBody}</p>
        <button id="gift-open" className="bl-btn ig-secondary-action" onClick={onOpen}>{t.giftOpen}</button>
      </div>
    </div>
  );
}

function GiftSheet({ cfg, t, lang, onClose }: S & { lang: Lang; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.getElementById('gift-open');
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), a[href], input:not(:disabled)'));
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Wait until the page has left its inert state before restoring focus.
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, []);
  const doCopy = async (key: string, value: string) => {
    if (!await copyText(key === 'addr' ? value : value.replace(/\s/g, ''))) return;
    setCopied(key);
    window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1800);
  };
  return (
    <div ref={dialogRef} className="bl-col" role="dialog" aria-modal="true" aria-label={t.giftTitle}
      style={{ position: 'fixed', top: 0, bottom: 0, zIndex: 88, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button className="ig-modal-scrim" type="button" tabIndex={-1} aria-label={lang === 'en' ? 'Close gift details' : 'Tutup detail hadiah'} onClick={onClose} />
      <div style={{ position: 'relative', maxHeight: '84%', overflowY: 'auto', background: PAPER, borderRadius: '26px 26px 0 0', padding: '20px 22px 28px', animation: 'vSheet .42s cubic-bezier(.2,.9,.25,1) both' }}>
        <div style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(51,48,42,.18)', margin: '0 auto 16px' }} />
        <div className="ig-sheet-heading">
          <div>
            <div style={{ font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.08em', textTransform: 'uppercase', color: RED }}>{t.giftKicker}</div>
            <div className="bl-display" style={{ marginTop: 2, fontSize: 36, lineHeight: 1.1 }}>{t.giftTitle}</div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={lang === 'en' ? 'Close' : 'Tutup'} style={{ width: 44, height: 44, border: '1px solid rgba(51,48,42,.18)', background: CARD, borderRadius: '50%', cursor: 'pointer', font: "300 15px/1 var(--f-ui)" }}>&times;</button>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {giftCards(cfg, t, lang).map(g => (
            <div className="bl-clip" key={g.key} style={{ position: 'relative', padding: 20, background: g.bg, color: g.fg, borderRadius: 18 }}>
              <Orn slot={g.slot} style={{ right: -24, bottom: -20, width: 104, height: 104, opacity: .22 }} />
              <div className="ig-gift-card-head">
                <span style={{ font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.1em', textTransform: 'uppercase', opacity: .9 }}>{g.label}</span>
                <span style={{ font: "400 10px/1 var(--f-ui)", letterSpacing: '.06em', textTransform: 'uppercase', opacity: .72 }}>{g.kind}</span>
              </div>
              <div className="bl-serif ig-gift-value" style={{ position: 'relative', marginTop: 12, fontSize: g.size, lineHeight: 1.25, letterSpacing: '.02em', whiteSpace: 'pre-line' }}>{g.value.trim()}</div>
              {g.holder && <div style={{ position: 'relative', marginTop: 6, font: "400 12px/1.6 var(--f-body)", opacity: .8 }}>{g.holder}</div>}
              <button className="bl-btn" onClick={() => doCopy(g.key, g.value)} style={{ position: 'relative', marginTop: 16, width: '100%', padding: 13, background: g.btnBg, color: g.btnFg, borderRadius: 10, letterSpacing: '.12em' }}>
                {copied === g.key ? t.copied : g.copyLabel}
              </button>
            </div>
          ))}
        </div>
        <p className="ig-gift-note">{t.giftNote}</p>
      </div>
    </div>
  );
}

function Hashtag({ tag, t }: { tag: string; t: Copy }) {
  const clean = String(tag || '').trim().replace(/\s+/g, '');
  if (!clean) return null;
  const shown = clean.startsWith('#') ? clean : '#' + clean;
  return (
    <div style={{ margin: '0 auto 30px', display: 'grid', justifyItems: 'center', gap: 10 }}>
      <div className="ig-hashtag-kicker" style={{ font: "600 11px/1.4 var(--f-ui)", letterSpacing: '.08em', textTransform: 'uppercase' }}>{t.tagKicker}</div>
      <div className="bl-hashtag" style={{ fontSize: 30, lineHeight: 1.2, overflowWrap: 'anywhere', maxWidth: '100%' }}>{shown}</div>
    </div>
  );
}

function Closing({ cfg, t, coupleShort }: S & { coupleShort: string }) {
  return (
    <section className="bl-sec bl-gilded ig-closing" data-screen-label="Penutup">
      <div className="ig-closing-copy">
        <Monogram className="ig-closing-mark" />
        <Hashtag tag={cfg.hashtag} t={t} />
        <p style={{ maxWidth: 330, margin: '0 auto', lineHeight: 1.9, textWrap: 'pretty' } as CSSProperties}>{t.closing}</p>
        <div className="bl-display bl-couple-name" style={{ marginTop: 18, fontSize: 56, lineHeight: 1.1 }}>{coupleShort}</div>
        <div className="ig-closing-family">{t.withFamily}</div>
      </div>
      <footer className="ig-closing-footer">
        <div>{t.watermark}</div>
      </footer>
    </section>
  );
}
