import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import '../styles/blossom.css';
import { COPY } from '../config/copy';
import type { Copy } from '../config/copy';
import { RIBBON, THREAD, THREAD_X, slotSrc } from '../config/slots';
import { fontVars } from '../config/fonts';
import { isPreview, useConfig } from '../lib/config';
import { copyText } from '../lib/clipboard';
import { useGuest } from '../lib/guest';
import { useMusic } from '../lib/music';
import { sheets, sheetsReady } from '../lib/sheets';
import { queueRsvp, startOutbox } from '../lib/outbox';
import type { Lang, WeddingConfig } from '../types';

/* Blossom Garden v2 — a faithful port of the Claude Design prototype, wired to
   the Sheets backend (RSVP, wishes, visit tracking) and the ?to= guest link. */

const Assets = createContext<Record<string, string>>({});

/* Two section backgrounds only — sage green and paper white; everything else is
   type, card and ornament colour. */
/* Ivory Blossom Garden: warm olive and taupe echo the dress, while muted gold
   supplies a little celebratory light without turning the invitation yellow. */
const SAGE = '#747963', DEEP = '#5A604D', PAPER = '#F3EADB', CARD = '#FFF9EF';
const INK = '#3E352C', RED = '#A06B5B', RED_TEXT = '#8B594A', GOLD = '#C9A15D', GOLD_LIGHT = '#FFEAB0';

/* ---------- small building blocks ---------- */

type Flip = 'x' | 'y' | 'xy';
const FLIP: Record<Flip, string> = { x: 'scaleX(-1)', y: 'scaleY(-1)', xy: 'scale(-1,-1)' };

/* The flip sits on the <img> so the wrapper's sway/float animation can't cancel it. */
function Orn({ slot, style, className, flip }: { slot: string; style: CSSProperties; className?: string; flip?: Flip }) {
  const assets = useContext(Assets);
  const src = slotSrc(assets, slot);
  if (!src) return null;
  return (
    <div className={'bl-orn' + (className ? ' ' + className : '')} style={style}>
      <img src={src} alt="" loading="lazy" decoding="async" style={flip ? { transform: FLIP[flip] } : undefined} />
    </div>
  );
}

/* Corner artwork is drawn for the bottom-right corner. Every other corner is the
   same image mirrored, and swings in mirrored time, so the frame stays symmetric. */
type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNER: Record<Corner, { flip?: Flip; origin: string; anim: string; x: 'left' | 'right'; y: 'top' | 'bottom' }> = {
  tl: { flip: 'xy', origin: 'top left', anim: 'vCorner', x: 'left', y: 'top' },
  tr: { flip: 'y', origin: 'top right', anim: 'vCornerR', x: 'right', y: 'top' },
  bl: { flip: 'x', origin: 'bottom left', anim: 'vCornerR', x: 'left', y: 'bottom' },
  br: { origin: 'bottom right', anim: 'vCorner', x: 'right', y: 'bottom' }
};

function CornerOrn({ slot, at, width, ratio = '900 / 719', inset = -8, opacity, secs = 12 }: {
  slot: string; at: Corner; width: string | number; ratio?: string; inset?: number; opacity?: number; secs?: number;
}) {
  const c = CORNER[at];
  const style: CSSProperties = {
    width, aspectRatio: ratio, opacity,
    transformOrigin: c.origin, animation: c.anim + ' ' + secs + 's ease-in-out infinite'
  };
  style[c.x] = inset;
  style[c.y] = inset;
  return <Orn slot={slot} className="bl-natural-ratio" flip={c.flip} style={style} />;
}

/* The cover and the invitation itself park their controls on the same spot, so
   the language chip stays put while everything around it changes. */
const CTL_TOP = 'calc(14px + env(safe-area-inset-top))', CTL_RIGHT = 14;

/* Corners come in pairs rather than all four: the cover is anchored along its
   bottom edge and the opened page along its top, so each screen has one planted
   band of flowers and one open half for the photograph. */
function Corners({ slot, width, at, opacity }: { slot: string; width: string; at: Corner[]; opacity?: number }) {
  return <>{at.map(c => <CornerOrn key={c} slot={slot} at={c} width={width} inset={0} opacity={opacity} />)}</>;
}

/* Section edges are a scalloped border, not a gradient: fading dark sage into
   paper over a few pixels only ever goes through muddy grey, however the stops
   are placed. A row of arcs hands the edge a shape instead, so both colours stay
   clean right up to the line. The arcs are quadratic (control y = twice the
   depth) and the band stretches to the column width. */
const SCALLOP_N = 12, SCALLOP_W = 40, SCALLOP_D = 12;
const SCALLOP_CURVE = 'M0,0 ' + ('q' + SCALLOP_W / 2 + ',' + SCALLOP_D * 2 + ' ' + SCALLOP_W + ',0 ').repeat(SCALLOP_N);

/** Teeth of `color` hanging into the section below, edged with a gold hairline. */
function Scallop({ color }: { color: string }) {
  const isPaper = color === PAPER;
  const textureId = 'bl-sand-' + useId().replace(/:/g, '');
  return (
    <svg viewBox={'0 0 ' + SCALLOP_N * SCALLOP_W + ' ' + (SCALLOP_D + 1)} preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: SCALLOP_D + 1, display: 'block' }}>
      {isPaper && <defs>
        <pattern id={textureId} width="320" height="160" patternUnits="userSpaceOnUse">
          <rect width="320" height="160" fill={PAPER} />
          <image href="/assets/paper-texture.webp" width="320" height="320" opacity=".12" style={{ mixBlendMode: 'multiply' }} />
          <circle cx="54" cy="8" r=".9" fill={GOLD} opacity=".42" />
          <circle cx="236" cy="11" r=".65" fill={GOLD} opacity=".3" />
        </pattern>
      </defs>}
      <path d={SCALLOP_CURVE + 'L0,0 Z'} fill={isPaper ? 'url(#' + textureId + ')' : color} />
      <path d={SCALLOP_CURVE} fill="none" stroke="rgba(201,161,93,.42)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* Only the few boundaries marked `orn` also carry the mirrored bouquet — flowers
   at every seam made the scroll feel crowded. */
const SEAM_W = '34%';
function Seam({ from, offset = 0, orn = false }: { from: string; offset?: number; orn?: boolean }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 0, zIndex: 5, top: offset }}>
      <Scallop color={from} />
      {orn && <>
        <Orn slot="orn-seam" className="bl-natural-ratio bl-seam-left" style={{ left: 0, top: 0, width: SEAM_W, aspectRatio: '822 / 560', translate: '0 -50%', transformOrigin: 'left center', opacity: .8, animation: 'vCorner 13s ease-in-out infinite' }} />
        <Orn slot="orn-seam" className="bl-natural-ratio bl-seam-right" flip="x" style={{ right: 0, top: 0, width: SEAM_W, aspectRatio: '822 / 560', translate: '0 -50%', transformOrigin: 'right center', opacity: .8, animation: 'vCornerR 13s ease-in-out infinite' }} />
      </>}
    </div>
  );
}

/** Horizontal offset of the red thread at a given fraction of its height. */
function threadX(frac: number) {
  const pos = Math.min(frac * THREAD.height / 10, THREAD_X.length - 1);
  const i = Math.floor(pos), f = pos - i;
  const a = THREAD_X[i] ?? THREAD_X[i + 1] ?? 0, b = THREAD_X[i + 1] ?? a;
  return +(a + (b - a) * f).toFixed(1);
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

function Photo({ slot, fallback, focus, alt = '' }: { slot: string; fallback?: ReactNode; focus?: string; alt?: string }) {
  const assets = useContext(Assets);
  const src = assets[slot];
  return src
    ? <img className="bl-fill" src={src} alt={alt} decoding="async" referrerPolicy="no-referrer" style={focus ? { objectPosition: focus } : undefined} />
    : <>{fallback ?? null}</>;
}

function Kicker({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div className="bl-kicker bl-reveal-kicker" style={{ color: color || RED_TEXT, ...style }}>{children}</div>;
}

const letters = (word: string, base: number) =>
  String(word || '').split('').map((c, i) => ({ c: c === ' ' ? '\u00A0' : c, d: (base + i * 0.07).toFixed(2) + 's' }));

const two = (n: number) => String(n).padStart(2, '0');

function splitTime(val: string) {
  const m = String(val).match(/^([\d.:]+)\s*(.*)$/);
  return m ? { hour: m[1], zone: m[2] || '' } : { hour: val, zone: '' };
}

function safeDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date('2027-01-03T09:00:00+07:00') : d;
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

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const se = document.scrollingElement || document.documentElement;
      const max = se.scrollHeight - se.clientHeight;
      setP(max > 0 ? (se.scrollTop / max) * 100 : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  return p;
}

/** Give non-scroll-timeline browsers a deliberate section entrance too. */
function useSectionReveal(active: boolean) {
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.bl-sec'));
    sections.forEach((section, index) => {
      section.classList.add('bl-will-reveal');
      section.style.setProperty('--reveal-delay', Math.min(index * 45, 180) + 'ms');
    });
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('bl-revealed'); observer.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [active]);
}

const go = (label: string) => () => {
  document.querySelector('[data-screen-label="' + label + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ---------- page ---------- */

export default function Invitation() {
  const cfg = useConfig();
  const preview = isPreview();
  const guest = useGuest(!preview);
  const [langPick, setLangPick] = useState<Lang | null>(null);
  const lang: Lang = langPick || cfg.lang || 'id';
  const t = COPY[lang] || COPY.id;
  const [closed, setClosed] = useState(true);
  const [opening, setOpening] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const music = useMusic(cfg.musicUrl);
  const progress = useScrollProgress();
  useSectionReveal(!closed);

  const groom = cfg.groomName || 'Ave';
  const bride = cfg.brideName || 'Mumu';
  const coupleShort = groom + ' & ' + bride;
  const dateLabel = lang === 'en' ? cfg.dateLabelEn || cfg.dateLabel : cfg.dateLabel;

  useEffect(() => {
    document.title = coupleShort + (lang === 'en' ? ' — Wedding Invitation' : ' — Undangan Pernikahan');
    document.documentElement.lang = lang;
    document.documentElement.classList.add('bl-document');
    return () => document.documentElement.classList.remove('bl-document');
  }, [coupleShort, lang]);

  // Deliver any RSVP a previous visit could not send (see lib/outbox.ts).
  useEffect(() => startOutbox(), []);

  // No scrolling behind the cover or the gift sheet.
  useEffect(() => {
    const lock = closed || giftOpen;
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    return () => { document.documentElement.style.overflow = ''; };
  }, [closed, giftOpen]);

  const toggleLang = () => setLangPick(lang === 'id' ? 'en' : 'id');

  const onOpen = () => {
    window.scrollTo(0, 0);
    setOpening(true);
    setClosed(false);
    window.setTimeout(() => setOpening(false), 1350);
    if (!music.playing) music.start();
    sheets.track({ inviteKey: guest.key, event: 'open-invitation' });
  };

  return (
    <Assets.Provider value={cfg.assets || {}}>
      <div className="bl-root" style={fontVars(cfg.displayFont, cfg.bodyFont) as CSSProperties}>
        <div className="bl-page">
          {/* Everything below the cover stays unmounted until the guest opens the
              invitation. Rendered eagerly it pulled ~1.3 MB of ornaments on a phone
              that was still looking at the envelope; `loading="lazy"` does not help
              because the cover overlays the content rather than scrolling past it.
              Keeping it unmounted also stops the dock from taking keyboard focus
              while the cover is up. */}
          {!closed && (<>
          <div className="bl-col" style={{ position: 'fixed', top: 0, height: 3, background: 'rgba(51,48,42,.08)', zIndex: 60 }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,' + SAGE + ',' + GOLD + ')', width: progress.toFixed(1) + '%' }} />
          </div>

          <Petals />

          <Hero cfg={cfg} t={t} dateLabel={dateLabel} />
          <Ticker text={coupleShort + ' — ' + dateLabel} />
          <Seam from={SAGE} />
          <Quote t={t} />
          <Couple cfg={cfg} t={t} />
          <Seam from={PAPER} orn />
          <Events cfg={cfg} t={t} dateLabel={dateLabel} />
          <Seam from={SAGE} />
          <Location cfg={cfg} t={t} coupleShort={coupleShort} />
          <Story cfg={cfg} t={t} lang={lang} />
          <Seam from={PAPER} />
          <Rsvp t={t} guest={guest} preview={preview} />
          <Seam from={SAGE} />
          <Wishes t={t} guest={guest} preview={preview} />
          <GiftSection cfg={cfg} t={t} onOpen={() => setGiftOpen(true)} />
          <Seam from={PAPER} orn />
          <Closing cfg={cfg} t={t} coupleShort={coupleShort} />

          <div className="bl-col" style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', zIndex: 58, pointerEvents: 'none' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 6, background: CARD, border: '1px solid rgba(116,121,99,.16)', borderRadius: 999, boxShadow: '0 12px 34px rgba(62,53,44,.20)', pointerEvents: 'auto' }}>
              <button className="bl-dock-btn" onClick={go('Mempelai')}>{t.coupleTitle}</button>
              <button className="bl-dock-btn" onClick={go('Acara')}>{t.navEvents}</button>
              <button className="bl-dock-btn" onClick={go('Story')}>{t.navStory}</button>
              <button className="bl-dock-btn" onClick={go('RSVP')}>RSVP</button>
            </nav>
          </div>

          {/* Music and language are settings, not destinations: their own stack in
              the top-right corner, with the language chip on exactly the spot the
              cover put it so opening the invitation never moves it. */}
          <div className="bl-col" style={{ position: 'fixed', top: CTL_TOP, display: 'flex', justifyContent: 'flex-end', paddingRight: CTL_RIGHT, boxSizing: 'border-box', zIndex: 58, pointerEvents: 'none' }}>
            <div style={{ display: 'grid', gap: 8, pointerEvents: 'auto' }}>
              <button className="bl-icon-btn" onClick={toggleLang} title="Language" aria-label="Language">
                <span style={{ font: "600 10px/1 var(--f-ui)", letterSpacing: '.1em' }}>{lang === 'id' ? 'EN' : 'ID'}</span>
              </button>
              <button className="bl-icon-btn" onClick={music.toggle} title={music.playing ? t.musicOn : t.musicOff} aria-label={music.playing ? t.musicOn : t.musicOff}
                style={music.playing ? { background: RED, color: CARD, borderColor: 'transparent' } : undefined}>
                <span style={{ font: "400 13px/1 var(--f-ui)" }}>{music.playing ? '❙❙' : '♪'}</span>
              </button>
            </div>
          </div>
          </>)}

          {music.ytSrc && (
            <div className="bl-clip" style={{ position: 'fixed', width: 1, height: 1, left: -10, bottom: 0, opacity: .01, pointerEvents: 'none' }}>
              {/* Load before the cover opens. iOS/Samsung allow a play command
                  from the guest's tap much more reliably than a new autoplaying iframe. */}
              <iframe ref={music.setYtFrame} src={music.ytSrc} title="Musik latar" allow="autoplay; encrypted-media" style={{ width: 240, height: 240, border: 0 }}
                onLoad={e => music.onYtLoad(e.currentTarget)} />
            </div>
          )}

          {giftOpen && <GiftSheet cfg={cfg} t={t} lang={lang} onClose={() => setGiftOpen(false)} />}

          {closed && (
            <Cover cfg={cfg} t={t} dateLabel={dateLabel} coupleShort={coupleShort} guestName={guest.name}
              langLabel={lang === 'id' ? 'EN' : 'ID'} onOpen={onOpen} onToggleLang={toggleLang} />
          )}

          {opening && (
            <div className="bl-col bl-screen" style={{ zIndex: 85, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, background: SAGE, animation: 'vFlapTop 1.25s cubic-bezier(.66,0,.25,1) both' }} />
              <div style={{ flex: 1, background: DEEP, animation: 'vFlapBot 1.25s cubic-bezier(.66,0,.25,1) both' }} />
            </div>
          )}
        </div>
      </div>
    </Assets.Provider>
  );
}

/* ---------- sections ---------- */

type S = { cfg: WeddingConfig; t: Copy };

function Petals() {
  // slot, left %, size px, fall s, delay s, sway s
  // Five petals, well spaced: enough to feel alive, few enough to stay quiet.
  const petals: [string, number, number, number, number, number][] = [
    ['petal-a', 9, 15, 24, -3, 4.2], ['petal-c', 31, 17, 27, -11, 4.8], ['petal-e', 54, 13, 22, -19, 4.4],
    ['petal-b', 76, 16, 29, -7, 3.7], ['petal-d', 93, 12, 25, -15, 4.6]
  ];
  return (
    <div className="bl-col bl-petals" style={{ position: 'fixed', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 54, overflow: 'hidden' }}>
      {petals.map(([slot, left, size, fall, delay, sway], i) => (
        <div key={i} style={{ position: 'absolute', left: left + '%', top: 0, width: size, height: size, animation: 'vFall ' + fall + 's linear infinite', animationDelay: delay + 's' }}>
          <div style={{ width: '100%', height: '100%', animation: 'vPetalSway ' + sway + 's ease-in-out infinite alternate', animationDelay: (i * -0.7) + 's' }}>
            <Orn slot={slot} className="bl-petal" style={{ inset: 0, width: '100%', height: '100%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Cover({ t, dateLabel, coupleShort, guestName, langLabel, onOpen, onToggleLang }: S & {
  dateLabel: string; coupleShort: string; guestName: string; langLabel: string;
  onOpen: () => void; onToggleLang: () => void;
}) {
  const assets = useContext(Assets);
  return (
    <div className="bl-clip bl-cover bl-gilded" style={{ background: 'radial-gradient(circle at 50% 34%,rgba(255,249,239,.10),transparent 43%),' + SAGE, overscrollBehavior: 'contain' }}>
      <Corners slot="orn-cover-corner" at={['bl', 'br']} width="42%" opacity={.82} />
      <button className="bl-icon-btn" onClick={onToggleLang} title="Language" aria-label="Language"
        style={{ position: 'absolute', top: CTL_TOP, right: CTL_RIGHT, zIndex: 2, animation: 'vFade 1.2s 1.4s both' }}>
        <span style={{ font: "600 10px/1 var(--f-ui)", letterSpacing: '.1em' }}>{langLabel}</span>
      </button>
      <div style={{ position: 'relative', height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '50px 30px', color: PAPER, boxSizing: 'border-box' }}>
        <div>
          <div style={{ position: 'relative', width: 148, height: 148, margin: '0 auto 40px' }}>
            <Orn slot="orn-cover-ring" className="bl-center-xy" style={{ left: '50%', top: '50%', translate: '-50% -50%', width: 206, height: 206, opacity: .5, animation: 'vSpin 120s linear infinite' }} />
            <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(201,161,93,.7)', animation: 'vPop 1.1s .1s both, vFloat 9s 1.2s ease-in-out infinite', background: 'rgba(90,96,77,.55)' }}>
              <Photo slot="v-cover-round" focus="center 28%" alt={'Foto ' + coupleShort} fallback={
                <img src={slotSrc(assets, 'v-monogram')} alt="" style={{ position: 'absolute', inset: '22%', width: '56%', height: '56%', objectFit: 'contain', filter: 'invert(1)', opacity: .9 }} />
              } />
            </div>
          </div>
          <div style={{ font: "400 11px/1 var(--f-ui)", letterSpacing: '.11em', textTransform: 'uppercase', opacity: .82, animation: 'vFade 1.2s .4s both' }}>{t.weddingOf}</div>
          <div className="bl-display bl-couple-name" style={{ margin: '12px 0 0', fontSize: 68, lineHeight: 1.05, animation: 'vRise 1.1s .55s both' }}>{coupleShort}</div>
          <div style={{ margin: '18px auto', display: 'inline-block', padding: '8px 18px', border: '1px solid rgba(250,243,231,.4)', borderRadius: 999, font: "400 10px/1 var(--f-ui)", letterSpacing: '.08em', textTransform: 'uppercase', animation: 'vPop 1s .9s both' }}>{dateLabel}</div>
          <div style={{ font: "400 12px/1.7 var(--f-body)", opacity: .82, animation: 'vFade 1.2s 1.1s both' }}>{t.guestGreeting}</div>
          {guestName && (
            <div className="bl-display" style={{ marginTop: 4, fontSize: 36, lineHeight: 1.2, color: GOLD_LIGHT, animation: 'vFade 1.2s 1.2s both' }}>{guestName}</div>
          )}
          <div style={{ marginTop: 24, animation: 'vPop 1s 1.3s both' }}>
            <button className="bl-btn bl-compact-btn" onClick={onOpen} style={{ padding: '13px 24px', background: GOLD, color: INK, boxShadow: '0 12px 28px rgba(0,0,0,.28)' }}>{t.openInvite}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ cfg, t, dateLabel }: S & { dateLabel: string }) {
  const g = letters(cfg.groomName, 0.4), b = letters(cfg.brideName, 1.05);
  const letter = (l: { c: string; d: string }, i: number) => (
    <span key={i} style={{ display: 'inline-block', animation: 'vLetter 1s cubic-bezier(.2,.9,.2,1) both', animationDelay: l.d }}>{l.c}</span>
  );
  return (
    <section className="bl-sec bl-gilded bl-hero" data-screen-label="Hero" style={{ position: 'relative', minHeight: 600, background: SAGE }}>
      <div className="bl-clip" style={{ position: 'absolute', inset: 0 }}>
        <div className="sv-para" style={{ position: 'absolute', inset: '-12% 0' }}><Photo slot="v-hero" /></div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(90,96,77,.57),rgba(90,96,77,.18) 42%,rgba(90,96,77,.88))' }} />
      </div>
      <Corners slot="orn-hero-corner" at={['tl', 'tr']} width="42%" opacity={.7} />
      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateRows: '1fr auto', padding: '70px 26px 42px', color: PAPER, textAlign: 'center', boxSizing: 'border-box' }}>
        <div style={{ alignSelf: 'center' }}>
          <div style={{ font: "400 11px/1 var(--f-ui)", letterSpacing: '.11em', textTransform: 'uppercase', opacity: .78, animation: 'vFade 1.2s .2s both' }}>{t.weddingOf}</div>
          <div style={{ position: 'relative', margin: '20px 0 0' }}>
            <Orn slot="orn-hero-ring" className="bl-center-xy" style={{ left: '50%', top: '50%', translate: '-50% -50%', width: 296, height: 296, opacity: .16, animation: 'vSpin 150s linear infinite' }} />
            {/* Names intentionally return to their more ceremonial stacked form,
                with a light "dan" bridge between them. */}
            <h1 className="bl-display bl-couple-name bl-hero-name" aria-label={`${cfg.groomName} ${t.and} ${cfg.brideName}`}
              style={{ position: 'relative', margin: 0, lineHeight: .82 }}>
              <span style={{ display: 'block' }}>{g.map(letter)}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '9px 0 7px' }}>
                <span style={{ width: 38, height: 1, background: GOLD, transformOrigin: 'right', animation: 'vLine .8s .72s both' }} />
                <span style={{ color: CARD, font: "600 13px/1 var(--f-ui)", letterSpacing: '.08em', animation: 'vPop .8s .78s both' }}>{t.and}</span>
                <span style={{ width: 38, height: 1, background: GOLD, transformOrigin: 'left', animation: 'vLine .8s .72s both' }} />
              </span>
              <span style={{ display: 'block' }}>{b.map(letter)}</span>
            </h1>
          </div>
        </div>
        <div style={{ textShadow: '0 1px 14px rgba(40,44,35,.6)' }}>
          <div style={{ font: "500 11px/1.8 var(--f-body)", letterSpacing: '.14em', textTransform: 'uppercase', animation: 'vFade 1.2s 1.6s both' }}>{dateLabel}</div>
          <div style={{ marginTop: 4, font: "400 12px/1.8 var(--f-body)", opacity: .84, animation: 'vFade 1.2s 1.75s both' }}>{cfg.venue}, {cfg.city}</div>
          <div className="bl-scroll-cue" aria-hidden="true"><span /></div>
        </div>
      </div>
    </section>
  );
}

function Ticker({ text }: { text: string }) {
  const icon = (slot: string, k: number) => (
    <span key={'i' + k} style={{ display: 'inline-block', width: 28, height: 28, position: 'relative' }}>
      <Orn slot={slot} style={{ inset: 0, width: '100%', height: '100%' }} />
    </span>
  );
  const items: ReactNode[] = [];
  ['orn-ticker-a', 'orn-ticker-b', 'orn-ticker-a', 'orn-ticker-b'].forEach((slot, k) => {
    items.push(<span key={'t' + k}>{text}</span>, icon(slot, k));
  });
  // Sits on the same green as the hero above it; two gold hairlines are enough to
  // read it as its own band without adding a third background colour.
  return (
    <div className="bl-clip" aria-hidden="true" style={{ position: 'relative', background: SAGE, color: GOLD, padding: '12px 0 14px', borderTop: '1px solid rgba(201,161,93,.28)', whiteSpace: 'nowrap' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 22, animation: 'vTicker 30s linear infinite', font: "400 10px/1 var(--f-ui)", letterSpacing: '.1em', textTransform: 'uppercase' }}>
        {items}
      </div>
    </div>
  );
}

function Quote({ t }: { t: Copy }) {
  return (
    <section className="bl-sec" data-screen-label="Quote" style={{ position: 'relative', padding: '78px 28px', textAlign: 'center' }}>
      <Orn slot="orn-quote-top" className="bl-center-x" style={{ left: '50%', top: 6, translate: '-50% 0', width: 172, height: 93, opacity: .48, animation: 'vFloat 12s ease-in-out infinite' }} />
      <div style={{ position: 'relative', paddingTop: 52 }}>
        <Kicker>{t.quoteSource}</Kicker>
        <p className="bl-serif sv-mask" style={{ margin: '18px auto 0', maxWidth: 340, fontSize: 16, lineHeight: 1.85, textWrap: 'pretty' } as CSSProperties}>{t.quote}</p>
        <p className="sv-rise-q" style={{ margin: '16px auto 0', maxWidth: 300, font: "400 12px/1.85 var(--f-body)", opacity: .6, textWrap: 'pretty' } as CSSProperties}>{t.quoteAlt}</p>
      </div>
    </section>
  );
}

function Couple({ cfg, t }: S) {
  const card: CSSProperties = { position: 'relative', padding: 18, background: CARD, border: '1px solid rgba(116,121,99,.14)', boxShadow: '0 16px 38px rgba(90,96,77,.09)' };
  const role: CSSProperties = { marginTop: 9, font: "500 11px/1 var(--f-ui)", letterSpacing: '.1em', textTransform: 'uppercase', color: RED };
  const parents: CSSProperties = { marginTop: 5, font: "400 12px/1.65 var(--f-body)", opacity: .78 };
  const initial = (name: string) => <div className="bl-initial" style={{ fontSize: 54 }}>{(name || '?').trim().charAt(0).toUpperCase()}</div>;
  return (
    <section className="bl-sec" data-screen-label="Mempelai" style={{ position: 'relative', padding: '64px 22px 78px' }}>
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 34 }}>
        <Kicker>{t.coupleKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 48 }}>{t.coupleTitle}</h2>
      </div>
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="sv-grow bl-reveal-card" style={{ ...card, borderRadius: '80px 14px 14px 80px' }}>
          <Orn slot="orn-groom-top" style={{ right: -12, top: -38, width: 74, height: 121, opacity: .85, animation: 'vFloat 8s ease-in-out infinite' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '132px 1fr', gap: 18, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 132, height: 132 }}>
              <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid ' + GOLD }}><Photo slot="v-groom" focus="center 28%" alt={'Foto ' + cfg.groomFull} fallback={initial(cfg.groomName)} /></div>
            </div>
            <div>
              <div className="bl-full-name" style={{ fontSize: 23, lineHeight: 1.18 }}>{cfg.groomFull}</div>
              <div style={role}>{t.sonOf}</div>
              <div style={parents}>{cfg.groomParents}</div>
              <IgButton handle={cfg.groomInstagram} align="left" />
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', justifySelf: 'center', width: 156, height: 72 }}>
          <Orn slot="orn-divider" style={{ inset: 0, width: '100%', height: '100%', opacity: .8, animation: 'vBeat 4s ease-in-out infinite' }} />
        </div>
        <div className="sv-grow bl-reveal-card" style={{ ...card, borderRadius: '14px 80px 80px 14px', textAlign: 'right' }}>
          <Orn slot="orn-bride-top" flip="x" style={{ left: -12, top: -38, width: 74, height: 121, opacity: .85, animation: 'vFloat 8s ease-in-out infinite' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 132px', gap: 18, alignItems: 'center' }}>
            <div>
              <div className="bl-full-name" style={{ fontSize: 23, lineHeight: 1.18 }}>{cfg.brideFull}</div>
              <div style={role}>{t.daughterOf}</div>
              <div style={parents}>{cfg.brideParents}</div>
              <IgButton handle={cfg.brideInstagram} align="right" />
            </div>
            <div style={{ position: 'relative', width: 132, height: 132 }}>
              <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid #9AA98A' }}><Photo slot="v-bride" focus="center 28%" alt={'Foto ' + cfg.brideFull} fallback={initial(cfg.brideName)} /></div>
            </div>
          </div>
        </div>
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
  const cells: [string, string, string][] = [[cd.d, t.days, 'sv-pop1'], [cd.h, t.hours, 'sv-pop2'], [cd.m, t.minutes, 'sv-pop3'], [cd.s, t.seconds, 'sv-pop4']];
  return (
    <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }} role="timer">
      {cells.map(([v, label, cls], i) => (
        <div key={label} className={cls} style={{ textAlign: 'center', padding: '0 2px', borderRight: i < 3 ? '1px solid rgba(250,243,231,.2)' : 0 }}>
          <div className="bl-serif" style={{ fontSize: 34, lineHeight: 1, color: GOLD_LIGHT }}>{v}</div>
          <div style={{ marginTop: 6, font: "500 10px/1 var(--f-ui)", letterSpacing: '.09em', textTransform: 'uppercase', opacity: .76 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function Events({ cfg, t, dateLabel }: S & { dateLabel: string }) {
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
  const ceremony = (label: string, name: string, time: { hour: string; zone: string }, accent: string) => (
    <div className="bl-event-card" style={{ padding: '19px 16px 17px', borderRadius: 16, background: 'rgba(250,243,231,.10)', border: '1px solid rgba(201,161,93,.3)' }}>
      <div style={{ font: "600 10.5px/1 var(--f-ui)", letterSpacing: '.06em', textTransform: 'uppercase', color: '#FFFFFF' }}>{label}</div>
      <div className="bl-display" style={{ marginTop: 7, fontSize: 34, lineHeight: 1.02 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 14, color: accent }}>
        <div className="bl-serif" style={{ fontSize: 31, lineHeight: 1 }}>{time.hour}</div>
        {time.zone && <div style={{ font: "500 10px/1 var(--f-ui)", letterSpacing: '.07em', textTransform: 'uppercase' }}>{time.zone}</div>}
      </div>
    </div>
  );

  return (
    <section className="bl-sec bl-gilded" data-screen-label="Acara" style={{ position: 'relative', padding: '74px 26px 80px', background: SAGE, color: PAPER }}>
      <Orn slot="orn-acara-ring" className="bl-center-x" style={{ left: '50%', top: 24, translate: '-50% 0', width: 252, height: 252, opacity: .18, animation: 'vSpin 170s linear infinite' }} />
      <div style={{ position: 'relative' }}>
        <Kicker color="#FFFFFF" style={{ letterSpacing: '.16em' }}>{t.eventKicker}</Kicker>
        <h2 className="bl-event-date" style={{ margin: '10px 0 0', fontSize: 33, lineHeight: 1.12 }}>{dateLabel}</h2>
        <div style={{ marginTop: 8, font: "400 13px/1.6 var(--f-body)", color: 'rgba(255,249,239,.86)' }}>{cfg.venue}</div>
        <Countdown iso={cfg.dateISO} t={t} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 12px 1fr', alignItems: 'stretch', gap: 10, marginTop: 30 }}>
          {ceremony(t.akadLabel, t.akadName, a, GOLD_LIGHT)}
          <div aria-hidden="true" style={{ display: 'grid', placeItems: 'center' }}><span style={{ width: 1, height: '72%', background: 'rgba(201,161,93,.55)' }} /></div>
          {ceremony(t.resepsiLabel, t.resepsiName, r, GOLD_LIGHT)}
        </div>
        <div style={{ marginTop: 22 }}>
          <div style={{ marginBottom: 9, textAlign: 'center', font: "600 11px/1 var(--f-ui)", letterSpacing: '.09em', textTransform: 'uppercase', color: '#FFFFFF' }}>{t.saveDate}</div>
          <div className="bl-calendar-actions">
            <a href={calendarHref} target="_blank" rel="noreferrer" className="bl-event-save">{t.calendarGoogle}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Story({ cfg, t, lang }: S & { lang: Lang }) {
  const c = cfg as unknown as Record<string, string>;
  const orns = ['orn-story-1', 'orn-story-2', 'orn-story-3', 'orn-story-4'];
  const flutter = ['7s', '7s .5s', '8s', '8s .6s'];
  const chapters = [1, 2, 3, 4]
    .map(n => {
      const titleId = c['story' + n + 'Title'];
      const bodyId = c['story' + n + 'Body'];
      return {
        n,
        year: c['story' + n + 'Year'],
        title: lang === 'en' ? c['story' + n + 'TitleEn'] || titleId : titleId,
        body: lang === 'en' ? c['story' + n + 'BodyEn'] || bodyId : bodyId
      };
    })
    .filter(ch => ch.title || ch.body);
  if (!chapters.length) return null;
  return (
    <section className="bl-sec" data-screen-label="Story" style={{ position: 'relative', padding: '64px 0 56px' }}>
      <div style={{ position: 'relative', textAlign: 'center', padding: '0 26px 22px' }}>
        <Kicker>{t.storyKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 46 }}>{t.storyTitle}</h2>
        <div className="bl-batang" style={{ marginTop: 6, fontSize: 13, opacity: .62 }}>{t.storySub}</div>
      </div>
      <div style={{ position: 'relative', padding: '0 18px' }}>
        <div style={{ position: 'relative', display: 'grid', paddingTop: THREAD.top }}>
          <img className="sv-draw bl-center-x" src={RIBBON} alt="" style={{ position: 'absolute', left: '50%', top: 0, translate: '-50% 0', width: THREAD.width, height: THREAD.top + THREAD.row * chapters.length, objectFit: 'fill', pointerEvents: 'none' }} />
          {chapters.map((ch, i) => {
            const left = i % 2 === 0;
            const y = THREAD.top + THREAD.row * (i + .5);
            const x = threadX(y / (THREAD.top + THREAD.row * chapters.length));
            return (
              <div key={ch.n} style={{ height: THREAD.row, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                <div className="sv-story bl-reveal-card" style={{ gridColumn: left ? 1 : 2, padding: left ? '0 40px 0 6px' : '0 6px 0 40px', textAlign: left ? 'right' : 'left' }}>
                  {ch.year && <div style={{ display: 'inline-block', padding: '5px 10px', background: SAGE, color: PAPER, borderRadius: 999, font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.09em' }}>{ch.year}</div>}
                  <div className="bl-display" style={{ marginTop: 6, fontSize: 28, lineHeight: 1.1 }}>{ch.title}</div>
                  <div style={{ marginTop: 5, font: "400 11.5px/1.6 var(--f-body)", opacity: .74, textWrap: 'pretty' } as CSSProperties}>{ch.body}</div>
                  <div style={{ position: 'relative', width: 60, height: 40, margin: left ? '8px 0 0 auto' : '8px 0 0', opacity: .6, animation: 'vFlutter ' + flutter[i] + ' ease-in-out infinite' }}>
                    <Orn slot={orns[ch.n - 1]} style={{ inset: 0, width: '100%', height: '100%' }} />
                  </div>
                </div>
                <div className="sv-knot" style={{ position: 'absolute', left: 'calc(50% + ' + x + 'px)', marginLeft: -7.5, marginTop: -7.5, top: y, width: 15, height: 15, borderRadius: '50%', background: RED, boxShadow: '0 0 0 4px ' + PAPER + ',0 0 0 6px rgba(160,107,91,.3)' }} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Location({ cfg, t, coupleShort }: S & { coupleShort: string }) {
  const [shared, setShared] = useState(false);
  const q = encodeURIComponent(cfg.mapsQuery || cfg.venue + ', ' + cfg.city);
  const onShare = async () => {
    const url = location.origin + location.pathname;   // never share someone's personal ?to= link
    if (navigator.share) {
      try { await navigator.share({ title: coupleShort, text: cfg.dateLabel + ' · ' + cfg.venue, url }); return; } catch { /* cancelled */ }
    }
    if (await copyText(url)) {
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }
  };
  const pill: CSSProperties = { flex: 1, textAlign: 'center', padding: 15, borderRadius: 999, font: "400 10px/1 var(--f-ui)", letterSpacing: '.12em', textTransform: 'uppercase' };
  return (
    <section className="bl-sec" data-screen-label="Lokasi" style={{ position: 'relative', padding: '72px 24px' }}>
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 20 }}>
        <Kicker>{t.locKicker}</Kicker>
        <h2 className="bl-place-name" style={{ margin: '6px 0 0', fontSize: 35 }}>{cfg.venue}</h2>
        <div style={{ marginTop: 6, font: "400 12.5px/1.7 var(--f-body)", opacity: .76 }}>{cfg.address}</div>
      </div>
      <div className="sv-wipe bl-clip bl-reveal-card" style={{ position: 'relative', height: 240, borderRadius: 18, border: '1px solid rgba(116,121,99,.16)', background: '#E4DECD' }}>
        <iframe src={'https://maps.google.com/maps?q=' + q + '&z=15&output=embed'} title="Peta lokasi" style={{ width: '100%', height: '100%', border: 0 }} loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="bl-btn" onClick={onShare} style={{ ...pill, width: '100%', background: CARD, border: '1px solid rgba(116,121,99,.2)', color: SAGE, boxShadow: '0 9px 22px rgba(90,96,77,.1)' }}>{shared ? t.shared : t.share}</button>
      </div>
    </section>
  );
}

type GuestInfo = { id: string; key: string; name: string };

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
  const key = 'rsvp:' + (guest.key || 'preview');
  const saved = useMemo<RsvpSaved | null>(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }, [key]);
  const [name, setName] = useState(saved?.name || guest.name);
  useAutoName(guest.name, name, setName, !!saved);
  const [attend, setAttend] = useState<'yes' | 'no' | null>(saved?.attend || null);
  // One invitation may confirm no more than two people. Clamp old local values
  // too, so an answer saved before this limit cannot be re-submitted above it.
  const [guests, setGuests] = useState(() => Math.min(2, Math.max(1, saved?.guests || 1)));
  const [done, setDone] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Separate from `err`: only a failed send is worth offering a retry for,
  // a missing name is not.
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setErr(t.needName);
    if (!attend) return setErr(t.pickAttend);
    if (!preview && !guest.key) return setErr(t.needInvite);
    setErr(''); setFailed(false); setBusy(true);
    try {
      if (!preview && sheetsReady) {
        await sheets.rsvp({ inviteKey: guest.key, name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
      }
      const rec: RsvpSaved = { name: name.trim(), attend, guests };
      try { localStorage.setItem(key, JSON.stringify(rec)); } catch { /* ignore */ }
      setDone(true);
    } catch {
      // Park it so the answer is not lost if this guest never comes back to retry.
      if (!preview && sheetsReady) {
        queueRsvp({ key, inviteKey: guest.key, name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
      }
      setErr(t.sendFailed);
      setFailed(true);
    } finally { setBusy(false); }
  };

  const choice = (on: boolean, bg: string, fg: string): CSSProperties => ({
    minHeight: 45, padding: 15, border: '1px solid rgba(116,121,99,.16)', background: on ? bg : CARD, color: on ? fg : INK,
    borderRadius: 11, font: "400 10px/1 var(--f-ui)", letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background .25s, color .25s'
  });
  const round: CSSProperties = { width: 45, height: 45, border: '1px solid rgba(116,121,99,.2)', background: CARD, borderRadius: '50%', cursor: 'pointer', font: "500 15px/1 var(--f-ui)" };

  return (
    <section className="bl-sec bl-gilded" data-screen-label="RSVP" style={{ position: 'relative', padding: '74px 24px', background: SAGE, color: PAPER }}>
      <div style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Kicker color="#FFFFFF">RSVP</Kicker>
          <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 43 }}>{t.rsvpTitle}</h2>
          <div style={{ marginTop: 6, font: "400 12px/1.7 var(--f-body)", opacity: .78 }}>{t.rsvpSub}</div>
        </div>
        {!done ? (
          <div className="bl-reveal-card" style={{ display: 'grid', gap: 11, padding: 22, background: CARD, color: INK, borderRadius: 20, boxShadow: '0 18px 42px rgba(33,36,28,.28)' }}>
            <input className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} aria-label={t.namePh} autoComplete="name" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <button onClick={() => setAttend('yes')} aria-pressed={attend === 'yes'} style={choice(attend === 'yes', SAGE, PAPER)}>{t.attend}</button>
              <button onClick={() => setAttend('no')} aria-pressed={attend === 'no'} style={choice(attend === 'no', RED, CARD)}>{t.notAttend}</button>
            </div>
            {attend !== 'no' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 9, alignItems: 'center', padding: '4px 2px' }}>
                <span style={{ font: "300 12px/1.5 var(--f-body)", opacity: .8 }}>{t.guestCount}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setGuests(g => Math.max(1, g - 1))} disabled={guests <= 1} style={round} aria-label="−">&minus;</button>
                  <span className="bl-serif" style={{ minWidth: 22, textAlign: 'center', fontSize: 19 }}>{guests}</span>
                  <button onClick={() => setGuests(g => Math.min(2, g + 1))} disabled={guests >= 2} style={round} aria-label="+">+</button>
                </div>
              </div>
            )}
            {err && (
              <div className="bl-msg" role="alert">
                {err}
                {failed && (
                  <button onClick={submit} disabled={busy}
                    style={{ marginLeft: 8, padding: '5px 12px', background: CARD, border: '1px solid currentColor', borderRadius: 999, color: 'inherit', font: "400 10px/1 var(--f-ui)", letterSpacing: '.14em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer' }}>
                    {t.retry}
                  </button>
                )}
              </div>
            )}
            <button className="bl-btn" onClick={submit} disabled={busy} style={{ padding: 16, background: SAGE, color: PAPER, borderRadius: 11 }}>{busy ? t.sending : t.sendRsvp}</button>
          </div>
        ) : (
          <div className="bl-reveal-card" style={{ padding: '28px 24px', textAlign: 'center', background: CARD, color: INK, borderRadius: 20, animation: 'vPop .6s both' }}>
            <div style={{ position: 'relative', width: 68, height: 68, margin: '0 auto 8px', opacity: .9, animation: 'vFloat 6s ease-in-out infinite' }}>
              <Orn slot="orn-rsvp-done" style={{ inset: 0, width: '100%', height: '100%' }} />
            </div>
            <div className="bl-display" style={{ fontSize: 32, lineHeight: 1.2 }}>{t.thanks} {name}</div>
            <div style={{ marginTop: 8, font: "400 12.5px/1.7 var(--f-body)", opacity: .72 }}>
              {attend === 'no' ? t.wontAttend : t.willAttend.replace('{n}', String(guests))}
            </div>
            {attend === 'yes' && guest.id && (
              <div style={{ margin: '18px auto 0', padding: '16px 16px 12px', width: 'max-content', background: PAPER, border: '1px solid rgba(116,121,99,.14)', borderRadius: 16 }}>
                <div className="bl-kicker" style={{ marginBottom: 10 }}>{t.qrTitle}</div>
                <QRCodeCanvas value={location.origin + '/checkin?g=' + encodeURIComponent(guest.id)} size={132} marginSize={1} fgColor={DEEP} bgColor={PAPER} />
                <div style={{ marginTop: 8, maxWidth: 150, font: "400 10.5px/1.5 var(--f-body)", opacity: .7 }}>{t.qrNote}</div>
              </div>
            )}
            <button className="bl-btn" onClick={() => setDone(false)} style={{ marginTop: 14, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(116,121,99,.3)', font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.1em' }}>{t.change}</button>
          </div>
        )}
      </div>
    </section>
  );
}

type WishView = { id: string; name: string; text: string; createdAt: string; mine?: boolean };

const SAMPLE_WISHES: WishView[] = [
  { id: 's1', name: 'Dita & Bayu', text: 'Selamat untuk kalian berdua! Semoga menjadi keluarga yang sakinah, mawaddah, warahmah.', createdAt: new Date(Date.now() - 26 * 3600000).toISOString() },
  { id: 's2', name: 'Raka', text: 'Bahagia lihat kalian sampai di titik ini. Sampai jumpa di hari bahagia!', createdAt: new Date(Date.now() - 50 * 3600000).toISOString() }
];

function Wishes({ t, guest, preview }: { t: Copy; guest: GuestInfo; preview: boolean }) {
  const [list, setList] = useState<WishView[]>(sheetsReady ? [] : SAMPLE_WISHES);
  const [name, setName] = useState(guest.name);
  useAutoName(guest.name, name, setName, false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const noteTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!sheetsReady) return;
    let alive = true;
    const load = () => sheets.listWishes()
      .then(ws => { if (alive) setList(ws.map(w => ({ id: w.id, name: w.name, text: w.text, createdAt: w.createdAt }))); })
      .catch(() => {});
    load();
    // New wishes are public immediately, so the wall also refreshes for guests
    // who leave the invitation open while others send their messages.
    const timer = window.setInterval(load, 25000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const submit = async () => {
    const n = name.trim(), w = text.trim();
    if (!n || !w) { setNote(!n ? t.needName : t.needWish); return; }
    if (!preview && !guest.key) { setNote(t.needInvite); return; }
    const mine: WishView = { id: 'local-' + Date.now(), name: n, text: w, createdAt: new Date().toISOString(), mine: true };
    setBusy(true);
    try {
      if (!preview && sheetsReady) await sheets.addWish({ name: n, text: w, inviteKey: guest.key });
      setList(l => [mine, ...l]);
      if (!preview && sheetsReady) {
        // Replace the optimistic entry with the server row (and its real id)
        // without waiting for the next periodic refresh.
        sheets.listWishes().then(ws => setList(ws.map(item => ({ id: item.id, name: item.name, text: item.text, createdAt: item.createdAt })))).catch(() => {});
      }
      setText('');
      setNote(sheetsReady && !preview ? t.wishPending : '');
    } catch {
      setNote(t.sendFailed);
    } finally {
      setBusy(false);
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(''), 5000);
    }
  };

  return (
    <section className="bl-sec" data-screen-label="Ucapan" style={{ position: 'relative', padding: '74px 24px' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Kicker>{t.wishKicker}</Kicker>
          <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 43 }}>{t.wishTitle}</h2>
          <div style={{ marginTop: 6, font: "400 12px/1.7 var(--f-body)", opacity: .7 }}>{t.wishSub}</div>
        </div>
        <div className="bl-reveal-card" style={{ display: 'grid', gap: 11, padding: 22, background: CARD, border: '1px solid rgba(116,121,99,.12)', borderRadius: 20 }}>
          <input className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} aria-label={t.namePh} />
          <textarea className="bl-field" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={t.wishPh} aria-label={t.wishPh} maxLength={600} />
          {note && <div className="bl-msg" style={{ color: note === t.wishPending ? SAGE : RED }}>{note}</div>}
          <button className="bl-btn bl-compact-btn" onClick={submit} disabled={busy} style={{ padding: 12, background: RED, color: CARD, borderRadius: 11 }}>{busy ? t.sending : t.sendWish}</button>
        </div>
        <div style={{ marginTop: 22, display: 'grid', gap: 10 }}>
          {list.map(w => (
            <div key={w.id} className="sv-wish bl-reveal-card" style={{ padding: '16px 18px', background: CARD, border: '1px solid rgba(116,121,99,.1)', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ font: "400 11px/1 var(--f-ui)", letterSpacing: '.12em', color: RED }}>{w.name}</span>
                <span style={{ font: "400 10px/1 var(--f-ui)", letterSpacing: '.06em', textTransform: 'uppercase', opacity: .52 }}>{fmtWhen(w.createdAt, t)}</span>
              </div>
              <div className="bl-batang" style={{ marginTop: 7, fontSize: 13.5, lineHeight: 1.75, opacity: .86, textWrap: 'pretty', whiteSpace: 'pre-line' } as CSSProperties}>{w.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function giftCards(cfg: WeddingConfig, t: Copy, lang: Lang) {
  const cards: { key: string; slot: string; label: string; kind: string; value: string; holder: string; bg: string; fg: string; btnBg: string; btnFg: string; size: number; copyLabel: string }[] = [];
  if (cfg.bank1Acct) cards.push({ key: 'b1', slot: 'orn-gift-1', label: cfg.bank1Name || 'Bank', kind: t.transfer, value: cfg.bank1Acct, holder: cfg.bank1Holder ? t.holderPrefix + cfg.bank1Holder : '', bg: 'linear-gradient(155deg,' + SAGE + ',' + DEEP + ')', fg: PAPER, btnBg: GOLD, btnFg: DEEP, size: 27, copyLabel: t.copy });
  if (cfg.bank2Acct) cards.push({ key: 'b2', slot: 'orn-gift-2', label: cfg.bank2Name || 'Bank', kind: t.transfer, value: cfg.bank2Acct, holder: cfg.bank2Holder ? t.holderPrefix + cfg.bank2Holder : '', bg: 'linear-gradient(155deg,#B88974,' + RED + ')', fg: CARD, btnBg: CARD, btnFg: RED, size: 27, copyLabel: t.copy });
  if (cfg.giftAddress) cards.push({ key: 'addr', slot: 'orn-gift-3', label: cfg.giftAddressLabel || (lang === 'en' ? 'Send a Gift' : 'Kirim Hadiah'), kind: t.addressKind, value: cfg.giftAddress, holder: cfg.giftAddressHolder, bg: CARD, fg: INK, btnBg: RED, btnFg: CARD, size: 17, copyLabel: t.copyAddr });
  return cards;
}

function GiftSection({ cfg, t, onOpen }: S & { onOpen: () => void }) {
  if (!cfg.bank1Acct && !cfg.bank2Acct && !cfg.giftAddress) return null;
  return (
    <section className="bl-sec" data-screen-label="Amplop" style={{ position: 'relative', padding: '74px 24px' }}>
      <Orn slot="orn-amplop" className="bl-center-x" style={{ left: '50%', top: 24, translate: '-50% 0', width: 190, height: 107, opacity: .42, animation: 'vFloat 11s ease-in-out infinite' }} />
      <div style={{ position: 'relative', textAlign: 'center', paddingTop: 24 }}>
        <Kicker>{t.giftKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 43 }}>{t.giftTitle}</h2>
        <p style={{ maxWidth: 310, margin: '12px auto 0', font: "400 12.5px/1.8 var(--f-body)", opacity: .74, textWrap: 'pretty' } as CSSProperties}>{t.giftBody}</p>
        <button className="bl-btn bl-compact-btn" onClick={onOpen} style={{ marginTop: 22, padding: '12px 24px', background: SAGE, color: PAPER, boxShadow: '0 10px 24px rgba(90,96,77,.22)', animation: 'vBeat 5s 2s ease-in-out infinite' }}>{t.giftOpen}</button>
      </div>
    </section>
  );
}

function GiftSheet({ cfg, t, lang, onClose }: S & { lang: Lang; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const doCopy = async (key: string, value: string) => {
    if (!await copyText(key === 'addr' ? value : value.replace(/\s/g, ''))) return;
    setCopied(key);
    window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1800);
  };
  return (
    <div className="bl-col" role="dialog" aria-modal="true" aria-label={t.giftTitle}
      style={{ position: 'fixed', top: 0, bottom: 0, zIndex: 88, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(33,36,28,.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'vScrim .35s both' }} />
      <div style={{ position: 'relative', maxHeight: '84%', overflowY: 'auto', background: PAPER, borderRadius: '26px 26px 0 0', padding: '20px 22px 28px', animation: 'vSheet .42s cubic-bezier(.2,.9,.25,1) both' }}>
        <div style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(51,48,42,.18)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>
            <div style={{ font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.08em', textTransform: 'uppercase', color: RED }}>{t.giftKicker}</div>
            <div className="bl-display" style={{ marginTop: 2, fontSize: 36, lineHeight: 1.1 }}>{t.giftTitle}</div>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ width: 44, height: 44, border: '1px solid rgba(51,48,42,.18)', background: CARD, borderRadius: '50%', cursor: 'pointer', font: "300 15px/1 var(--f-ui)" }}>&times;</button>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {giftCards(cfg, t, lang).map(g => (
            <div className="bl-clip" key={g.key} style={{ position: 'relative', padding: 20, background: g.bg, color: g.fg, borderRadius: 18 }}>
              <Orn slot={g.slot} style={{ right: -24, bottom: -20, width: 104, height: 104, opacity: .22 }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ font: "500 10.5px/1 var(--f-ui)", letterSpacing: '.1em', textTransform: 'uppercase', opacity: .9 }}>{g.label}</span>
                <span style={{ font: "400 10px/1 var(--f-ui)", letterSpacing: '.06em', textTransform: 'uppercase', opacity: .72 }}>{g.kind}</span>
              </div>
              <div className="bl-serif" style={{ position: 'relative', marginTop: 12, fontSize: g.size, lineHeight: 1.25, letterSpacing: '.02em', whiteSpace: 'pre-line' }}>{g.value.trim()}</div>
              {g.holder && <div style={{ position: 'relative', marginTop: 6, font: "400 12px/1.6 var(--f-body)", opacity: .8 }}>{g.holder}</div>}
              <button className="bl-btn" onClick={() => doCopy(g.key, g.value)} style={{ position: 'relative', marginTop: 16, width: '100%', padding: 13, background: g.btnBg, color: g.btnFg, borderRadius: 10, letterSpacing: '.12em' }}>
                {copied === g.key ? t.copied : g.copyLabel}
              </button>
            </div>
          ))}
        </div>
        <p style={{ margin: '16px 4px 0', font: "400 11.5px/1.7 var(--f-body)", opacity: .6, textAlign: 'center', textWrap: 'pretty' } as CSSProperties}>{t.giftNote}</p>
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
      <div style={{ font: "600 10.5px/1.4 var(--f-ui)", letterSpacing: '.08em', textTransform: 'uppercase', color: '#FFFFFF', opacity: .92 }}>{t.tagKicker}</div>
      <div className="bl-hashtag" style={{ fontSize: 30, lineHeight: 1.2, color: GOLD_LIGHT, overflowWrap: 'anywhere', maxWidth: '100%' }}>{shown}</div>
    </div>
  );
}

function Closing({ cfg, t, coupleShort }: S & { coupleShort: string }) {
  const year = String(safeDate(cfg.dateISO).getFullYear());
  return (
    <section className="bl-sec bl-gilded" data-screen-label="Penutup" style={{ position: 'relative', padding: '80px 26px 34px', background: SAGE, color: PAPER, textAlign: 'center' }}>
      <CornerOrn slot="orn-penutup-l" at="bl" width="40%" inset={0} opacity={.55} secs={14} />
      <CornerOrn slot="orn-penutup-l" at="br" width="40%" inset={0} opacity={.55} secs={14} />
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative', width: 120, height: 106, margin: '0 auto 18px', filter: 'invert(1)', animation: 'vFloat 7s ease-in-out infinite' }}>
          <Orn slot="v-monogram" style={{ inset: 0, width: '100%', height: '100%' }} />
        </div>
        <Hashtag tag={cfg.hashtag} t={t} />
        <p style={{ maxWidth: 290, margin: '0 auto', font: "400 12.5px/1.9 var(--f-body)", opacity: .84, textWrap: 'pretty' } as CSSProperties}>{t.closing}</p>
        <div className="bl-display bl-couple-name" style={{ marginTop: 18, fontSize: 56, lineHeight: 1.1 }}>{coupleShort}</div>
        <div style={{ marginTop: 8, font: "400 10.5px/1 var(--f-ui)", letterSpacing: '.09em', textTransform: 'uppercase', opacity: .72 }}>{t.withFamily}</div>
      </div>
      <div style={{ position: 'relative', marginTop: 46, padding: '16px 0 78px', borderTop: '1px solid rgba(250,243,231,.2)', display: 'grid', gap: 6, justifyItems: 'center' }}>
        <div style={{ font: "300 9px/1.6 var(--f-ui)", letterSpacing: '.14em', textTransform: 'uppercase', opacity: .62 }}>{t.watermark}</div>
        <div className="bl-batang" style={{ fontSize: 12, opacity: .5 }}>{coupleShort} &middot; {year}</div>
      </div>
    </section>
  );
}
