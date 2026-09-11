import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import '../styles/blossom.css';
import { COPY } from '../config/copy';
import type { Copy } from '../config/copy';
import { RIBBON, THREAD, THREAD_X, slotSrc } from '../config/slots';
import { fontVars } from '../config/fonts';
import { isPreview, useConfig } from '../lib/config';
import { slug, useGuest } from '../lib/guest';
import { setYtVolume, useMusic } from '../lib/music';
import { sheets, sheetsReady } from '../lib/sheets';
import { queueRsvp, startOutbox } from '../lib/outbox';
import type { Lang, WeddingConfig } from '../types';

/* Blossom Garden v2 — a faithful port of the Claude Design prototype, wired to
   the Sheets backend (RSVP, wishes, visit tracking) and the ?to= guest link. */

const Assets = createContext<Record<string, string>>({});

/* Two section backgrounds only — sage green and paper white; everything else is
   type, card and ornament colour. */
const SAGE = '#4A5343', DEEP = '#3B4235', PAPER = '#FBF6EC', CARD = '#FFFCF4';
const INK = '#33302A', RED = '#A93227', GOLD = '#F0C98A';

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
  return <Orn slot={slot} flip={c.flip} style={style} />;
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
  return (
    <svg viewBox={'0 0 ' + SCALLOP_N * SCALLOP_W + ' ' + (SCALLOP_D + 1)} preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: SCALLOP_D + 1, display: 'block' }}>
      <path d={SCALLOP_CURVE + 'L0,0 Z'} fill={color} />
      <path d={SCALLOP_CURVE} fill="none" stroke="rgba(240,201,138,.5)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* Only the few boundaries marked `orn` also carry the mirrored bouquet — flowers
   at every seam made the scroll feel crowded. */
const SEAM_W = 'min(34%, 150px)';
function Seam({ from, offset = 0, orn = false }: { from: string; offset?: number; orn?: boolean }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 0, zIndex: 5, top: offset }}>
      <Scallop color={from} />
      {orn && <>
        <Orn slot="orn-seam" style={{ left: 0, top: 0, width: SEAM_W, aspectRatio: '822 / 560', translate: '0 -50%', transformOrigin: 'left center', opacity: .8, animation: 'vCorner 13s ease-in-out infinite' }} />
        <Orn slot="orn-seam" flip="x" style={{ right: 0, top: 0, width: SEAM_W, aspectRatio: '822 / 560', translate: '0 -50%', transformOrigin: 'right center', opacity: .8, animation: 'vCornerR 13s ease-in-out infinite' }} />
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

function Photo({ slot, fallback, focus }: { slot: string; fallback?: ReactNode; focus?: string }) {
  const assets = useContext(Assets);
  const src = assets[slot];
  return src
    ? <img className="bl-fill" src={src} alt="" decoding="async" referrerPolicy="no-referrer" style={focus ? { objectPosition: focus } : undefined} />
    : <>{fallback ?? null}</>;
}

function Kicker({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div className="bl-kicker" style={{ color: color || RED, ...style }}>{children}</div>;
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

function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text).catch(() => {});
  return Promise.resolve();
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

  const groom = cfg.groomName || 'Ave';
  const bride = cfg.brideName || 'Mumu';
  const coupleShort = groom + ' & ' + bride;
  const dateLabel = lang === 'en' ? cfg.dateLabelEn || cfg.dateLabel : cfg.dateLabel;

  useEffect(() => {
    document.title = coupleShort + (lang === 'en' ? ' — Wedding Invitation' : ' — Undangan Pernikahan');
    document.documentElement.lang = lang;
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
    sheets.track({ guestId: guest.id, event: 'open-invitation' });
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
          <Story cfg={cfg} t={t} />
          <Location cfg={cfg} t={t} coupleShort={coupleShort} />
          <Seam from={PAPER} />
          <Rsvp t={t} guest={guest} preview={preview} />
          <Seam from={SAGE} />
          <Wishes t={t} guest={guest} preview={preview} />
          <GiftSection cfg={cfg} t={t} onOpen={() => setGiftOpen(true)} />
          <Seam from={PAPER} orn />
          <Closing cfg={cfg} t={t} coupleShort={coupleShort} />

          <div className="bl-col" style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', zIndex: 58, pointerEvents: 'none' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 6, background: CARD, border: '1px solid rgba(74,83,67,.16)', borderRadius: 999, boxShadow: '0 12px 34px rgba(51,48,42,.24)', pointerEvents: 'auto' }}>
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
                <span style={{ font: "500 9px/1 'Archivo'", letterSpacing: '.12em' }}>{lang === 'id' ? 'EN' : 'ID'}</span>
              </button>
              <button className="bl-icon-btn" onClick={music.toggle} title={music.playing ? t.musicOn : t.musicOff} aria-label={music.playing ? t.musicOn : t.musicOff}
                style={music.playing ? { background: RED, color: CARD, borderColor: 'transparent' } : undefined}>
                <span style={{ font: "400 13px/1 'Archivo'" }}>{music.playing ? '❙❙' : '♪'}</span>
              </button>
            </div>
          </div>
          </>)}

          {music.ytSrc && (
            <div className="bl-clip" style={{ position: 'fixed', width: 1, height: 1, left: -10, bottom: 0, opacity: .01, pointerEvents: 'none' }}>
              {/* The player ignores a volume sent before it is ready, so ask twice. */}
              <iframe src={music.ytSrc} title="Musik latar" allow="autoplay" style={{ width: 320, height: 180, border: 0 }}
                onLoad={e => { const f = e.currentTarget; setYtVolume(f); window.setTimeout(() => setYtVolume(f), 1200); }} />
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
    <div className="bl-clip bl-cover" style={{ background: SAGE, overscrollBehavior: 'contain' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Photo slot="v-cover" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(74,83,67,.7),rgba(74,83,67,.42) 40%,rgba(58,64,52,.94))' }} />
      </div>
      <Corners slot="orn-cover-corner" at={['bl', 'br']} width="min(42%, 24svh)" opacity={.82} />
      <button className="bl-icon-btn" onClick={onToggleLang} title="Language" aria-label="Language"
        style={{ position: 'absolute', top: CTL_TOP, right: CTL_RIGHT, zIndex: 2, animation: 'vFade 1.2s 1.4s both' }}>
        <span style={{ font: "500 9px/1 'Archivo'", letterSpacing: '.12em' }}>{langLabel}</span>
      </button>
      <div style={{ position: 'relative', height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '50px 30px', color: PAPER, boxSizing: 'border-box' }}>
        <div>
          <div style={{ position: 'relative', width: 148, height: 148, margin: '0 auto 40px' }}>
            <Orn slot="orn-cover-ring" style={{ left: '50%', top: '50%', translate: '-50% -50%', width: 206, height: 206, opacity: .5, animation: 'vSpin 120s linear infinite' }} />
            <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(240,201,138,.7)', animation: 'vPop 1.1s .1s both, vFloat 9s 1.2s ease-in-out infinite', background: 'rgba(59,66,53,.55)' }}>
              <Photo slot="v-cover-round" focus="center 28%" fallback={
                <img src={slotSrc(assets, 'v-monogram')} alt="" style={{ position: 'absolute', inset: '22%', width: '56%', height: '56%', objectFit: 'contain', filter: 'invert(1)', opacity: .9 }} />
              } />
            </div>
          </div>
          <div style={{ font: "300 9px/1 'Archivo'", letterSpacing: '.44em', textTransform: 'uppercase', opacity: .78, animation: 'vFade 1.2s .4s both' }}>{t.weddingOf}</div>
          <div className="bl-display" style={{ margin: '12px 0 0', fontSize: 68, lineHeight: 1.05, animation: 'vRise 1.1s .55s both' }}>{coupleShort}</div>
          <div style={{ margin: '18px auto', display: 'inline-block', padding: '8px 18px', border: '1px solid rgba(251,246,236,.4)', borderRadius: 999, font: "400 10px/1 'Archivo'", letterSpacing: '.28em', textTransform: 'uppercase', animation: 'vPop 1s .9s both' }}>{dateLabel}</div>
          <div style={{ font: "200 12px/1.7 var(--f-body)", opacity: .82, animation: 'vFade 1.2s 1.1s both' }}>{t.guestGreeting}</div>
          {guestName && (
            <div className="bl-display" style={{ marginTop: 4, fontSize: 36, lineHeight: 1.2, color: GOLD, animation: 'vFade 1.2s 1.2s both' }}>{guestName}</div>
          )}
          <div style={{ marginTop: 24, animation: 'vPop 1s 1.3s both' }}>
            <button className="bl-btn" onClick={onOpen} style={{ padding: '17px 30px', background: GOLD, color: DEEP, letterSpacing: '.28em', boxShadow: '0 14px 34px rgba(0,0,0,.32)' }}>{t.openInvite}</button>
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
    <section className="bl-sec" data-screen-label="Hero" style={{ position: 'relative', height: '100svh', minHeight: 600, background: SAGE }}>
      <div className="bl-clip" style={{ position: 'absolute', inset: 0 }}>
        <div className="sv-para" style={{ position: 'absolute', inset: '-12% 0' }}><Photo slot="v-hero" /></div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(74,83,67,.6),rgba(74,83,67,.2) 42%,rgba(58,64,52,.92))' }} />
      </div>
      <Corners slot="orn-hero-corner" at={['tl', 'tr']} width="min(42%, 24svh)" opacity={.7} />
      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateRows: '1fr auto', padding: '70px 26px 42px', color: PAPER, textAlign: 'center', boxSizing: 'border-box' }}>
        <div style={{ alignSelf: 'center' }}>
          <div style={{ font: "300 9px/1 'Archivo'", letterSpacing: '.44em', textTransform: 'uppercase', opacity: .72, animation: 'vFade 1.2s .2s both' }}>{t.weddingOf}</div>
          <div style={{ position: 'relative', margin: '20px 0 0' }}>
            <Orn slot="orn-hero-ring" style={{ left: '50%', top: '50%', translate: '-50% -50%', width: 296, height: 296, opacity: .16, animation: 'vSpin 150s linear infinite' }} />
            {/* The names are split into one span per letter to animate them, which a
                screen reader runs together as "PablodanAve". aria-label restores the
                spoken form; the animated letters below stay purely visual. */}
            <h1 className="bl-display" aria-label={`${cfg.groomName} ${t.and} ${cfg.brideName}`}
              style={{ position: 'relative', margin: 0, fontSize: 92, lineHeight: 1.02, fontWeight: 400 }}>
              <span style={{ display: 'block' }}>{g.map(letter)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 13, justifyContent: 'center', margin: '8px 0' }}>
                <span style={{ display: 'block', height: 1, width: 38, background: GOLD, transformOrigin: 'right', animation: 'vLine .8s 1s both' }} />
                <span className="bl-serif" style={{ fontSize: 20, fontStyle: 'italic', color: GOLD, animation: 'vPop .8s 1s both' }}>{t.and}</span>
                <span style={{ display: 'block', height: 1, width: 38, background: GOLD, transformOrigin: 'left', animation: 'vLine .8s 1s both' }} />
              </span>
              <span style={{ display: 'block' }}>{b.map(letter)}</span>
            </h1>
          </div>
        </div>
        <div style={{ textShadow: '0 1px 14px rgba(40,44,35,.6)' }}>
          <div style={{ font: "400 11px/1.8 var(--f-body)", letterSpacing: '.3em', textTransform: 'uppercase', animation: 'vFade 1.2s 1.6s both' }}>{dateLabel}</div>
          <div style={{ marginTop: 4, font: "200 12px/1.8 var(--f-body)", opacity: .84, animation: 'vFade 1.2s 1.75s both' }}>{cfg.venue}, {cfg.city}</div>
          <svg viewBox="0 0 24 24" style={{ width: 22, marginTop: 16, animation: 'vCue 2.2s infinite' }} fill="none" stroke={PAPER} strokeWidth={1.2} aria-hidden="true"><path d="M12 4 L12 20 M6 14 L12 20 L18 14" /></svg>
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
    <div className="bl-clip" aria-hidden="true" style={{ position: 'relative', background: SAGE, color: GOLD, padding: '12px 0 14px', borderTop: '1px solid rgba(240,201,138,.28)', whiteSpace: 'nowrap' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 22, animation: 'vTicker 30s linear infinite', font: "400 10px/1 'Archivo'", letterSpacing: '.32em', textTransform: 'uppercase' }}>
        {items}
      </div>
    </div>
  );
}

function Quote({ t }: { t: Copy }) {
  return (
    <section className="bl-sec" data-screen-label="Quote" style={{ position: 'relative', padding: '78px 28px', textAlign: 'center' }}>
      <Orn slot="orn-quote-top" style={{ left: '50%', top: 6, translate: '-50% 0', width: 172, height: 93, opacity: .48, animation: 'vFloat 12s ease-in-out infinite' }} />
      <div style={{ position: 'relative', paddingTop: 52 }}>
        <Kicker>{t.quoteSource}</Kicker>
        <p className="bl-serif sv-mask" style={{ margin: '18px auto 0', maxWidth: 330, fontSize: 19, fontStyle: 'italic', lineHeight: 1.75, textWrap: 'pretty' } as CSSProperties}>{t.quote}</p>
        <p className="sv-rise-q" style={{ margin: '16px auto 0', maxWidth: 300, font: "200 12px/1.85 var(--f-body)", opacity: .6, textWrap: 'pretty' } as CSSProperties}>{t.quoteAlt}</p>
      </div>
    </section>
  );
}

function Couple({ cfg, t }: S) {
  const card: CSSProperties = { position: 'relative', padding: 18, background: CARD, border: '1px solid rgba(74,83,67,.14)', boxShadow: '0 16px 38px rgba(74,83,67,.09)' };
  const role: CSSProperties = { marginTop: 9, font: "400 9px/1 'Archivo'", letterSpacing: '.26em', textTransform: 'uppercase', color: RED };
  const parents: CSSProperties = { marginTop: 5, font: "200 12px/1.65 var(--f-body)", opacity: .78 };
  const initial = (name: string) => <div className="bl-initial" style={{ fontSize: 54 }}>{(name || '?').trim().charAt(0).toUpperCase()}</div>;
  return (
    <section className="bl-sec" data-screen-label="Mempelai" style={{ position: 'relative', padding: '64px 22px 78px' }}>
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 34 }}>
        <Kicker>{t.coupleKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 48 }}>{t.coupleTitle}</h2>
      </div>
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="sv-grow" style={{ ...card, borderRadius: '80px 14px 14px 80px' }}>
          <Orn slot="orn-groom-top" style={{ right: -12, top: -38, width: 74, height: 121, opacity: .85, animation: 'vFloat 8s ease-in-out infinite' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '132px 1fr', gap: 18, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 132, height: 132 }}>
              <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid ' + GOLD }}><Photo slot="v-groom" focus="center 28%" fallback={initial(cfg.groomName)} /></div>
            </div>
            <div>
              <div className="bl-serif" style={{ fontSize: 24, lineHeight: 1.2 }}>{cfg.groomFull}</div>
              <div style={role}>{t.sonOf}</div>
              <div style={parents}>{cfg.groomParents}</div>
              <IgButton handle={cfg.groomInstagram} align="left" />
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', justifySelf: 'center', width: 156, height: 72 }}>
          <Orn slot="orn-divider" style={{ inset: 0, width: '100%', height: '100%', opacity: .8, animation: 'vBeat 4s ease-in-out infinite' }} />
        </div>
        <div className="sv-grow" style={{ ...card, borderRadius: '14px 80px 80px 14px', textAlign: 'right' }}>
          <Orn slot="orn-bride-top" flip="x" style={{ left: -12, top: -38, width: 74, height: 121, opacity: .85, animation: 'vFloat 8s ease-in-out infinite' }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 132px', gap: 18, alignItems: 'center' }}>
            <div>
              <div className="bl-serif" style={{ fontSize: 24, lineHeight: 1.2 }}>{cfg.brideFull}</div>
              <div style={role}>{t.daughterOf}</div>
              <div style={parents}>{cfg.brideParents}</div>
              <IgButton handle={cfg.brideInstagram} align="right" />
            </div>
            <div style={{ position: 'relative', width: 132, height: 132 }}>
              <div className="bl-clip" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid #9AA98A' }}><Photo slot="v-bride" focus="center 28%" fallback={initial(cfg.brideName)} /></div>
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
        <div key={label} className={cls} style={{ textAlign: 'center', padding: '0 2px', borderRight: i < 3 ? '1px solid rgba(251,246,236,.2)' : 0 }}>
          <div className="bl-serif" style={{ fontSize: 34, lineHeight: 1, color: GOLD }}>{v}</div>
          <div style={{ marginTop: 6, font: "300 8px/1 'Archivo'", letterSpacing: '.2em', textTransform: 'uppercase', opacity: .7 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function Events({ cfg, t, dateLabel }: S & { dateLabel: string }) {
  const dt = safeDate(cfg.dateISO);
  const q = encodeURIComponent(cfg.mapsQuery || cfg.venue + ', ' + cfg.city);
  const cal = (d: Date) => d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + 'T' + two(d.getUTCHours()) + two(d.getUTCMinutes()) + '00Z';
  const calendarHref = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' +
    encodeURIComponent(t.calendarTitle + cfg.groomName + ' & ' + cfg.brideName) +
    '&dates=' + cal(dt) + '/' + cal(new Date(dt.getTime() + 5 * 3600000)) + '&location=' + q;
  const a = splitTime(cfg.akadTime), r = splitTime(cfg.resepsiTime);
  const dateNumeric = two(dt.getDate()) + '.' + two(dt.getMonth() + 1) + '.' + dt.getFullYear();

  const block = (num: string, label: string, hour: string, zone: string, name: string, corner?: ReactNode, mt = 44) => (
    <div className="sv-rise" style={{ marginTop: mt, position: 'relative' }}>
      {corner}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span className="bl-serif" style={{ fontSize: 13, color: GOLD }}>{num}</span>
        <span style={{ flex: 1, height: 1, background: 'rgba(251,246,236,.3)' }} />
        <span style={{ font: "400 8px/1 'Archivo'", letterSpacing: '.3em', textTransform: 'uppercase', opacity: .7 }}>{label}</span>
      </div>
      {/* Hour and title are centred on each other across a hairline; end-aligning
          them pushed the script title down and read as a misalignment. */}
      <div style={{ position: 'relative', marginTop: 18, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'center' }}>
        <div className="bl-serif" style={{ fontSize: 54, lineHeight: 1, letterSpacing: '-.02em' }}>{hour}</div>
        <div style={{ borderLeft: '1px solid rgba(251,246,236,.2)', paddingLeft: 20 }}>
          <div style={{ font: "400 9px/1 'Archivo'", letterSpacing: '.24em', textTransform: 'uppercase', color: GOLD }}>{zone}</div>
          <div className="bl-display" style={{ marginTop: 8, fontSize: 42, lineHeight: 1.05 }}>{name}</div>
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 18, display: 'grid', gridTemplateColumns: '74px 1fr', gap: '6px 14px', font: "200 12px/1.6 var(--f-body)", opacity: .84, borderTop: '1px solid rgba(251,246,236,.2)', paddingTop: 12 }}>
        {[[t.dateWord, dateLabel], [t.placeWord, cfg.venue], [t.addressWord, cfg.address]].map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </div>
    </div>
  );

  return (
    <section className="bl-sec" data-screen-label="Acara" style={{ position: 'relative', padding: '74px 26px 80px', background: SAGE, color: PAPER }}>
      <Orn slot="orn-acara-ring" style={{ left: '50%', top: 24, translate: '-50% 0', width: 252, height: 252, opacity: .18, animation: 'vSpin 170s linear infinite' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid rgba(251,246,236,.28)' }}>
          <Kicker color={GOLD} style={{ letterSpacing: '.4em' }}>{t.eventKicker}</Kicker>
          <div className="bl-serif" style={{ fontSize: 14, letterSpacing: '.1em' }}>{dateNumeric}</div>
        </div>
        <Countdown iso={cfg.dateISO} t={t} />
        {block('I', t.akadLabel, a.hour, a.zone, t.akadName)}
        {block('II', t.resepsiLabel, r.hour, r.zone, t.resepsiName, undefined, 40)}
        <a href={calendarHref} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 34, padding: 16, textAlign: 'center', border: '1px solid ' + GOLD, color: GOLD, borderRadius: 999, font: "400 10px/1 'Archivo'", letterSpacing: '.26em', textTransform: 'uppercase' }}>{t.saveDate}</a>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div style={{ fontWeight: 400, letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 9, opacity: .65 }}>{k}</div>
      <div>{v}</div>
    </>
  );
}

function Story({ cfg, t }: S) {
  const c = cfg as unknown as Record<string, string>;
  const orns = ['orn-story-1', 'orn-story-2', 'orn-story-3', 'orn-story-4'];
  const flutter = ['7s', '7s .5s', '8s', '8s .6s'];
  const chapters = [1, 2, 3, 4]
    .map(n => ({ n, year: c['story' + n + 'Year'], title: c['story' + n + 'Title'], body: c['story' + n + 'Body'] }))
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
          <img className="sv-draw" src={RIBBON} alt="" style={{ position: 'absolute', left: '50%', top: 0, translate: '-50% 0', width: THREAD.width, height: THREAD.top + THREAD.row * chapters.length, objectFit: 'fill', pointerEvents: 'none' }} />
          {chapters.map((ch, i) => {
            const left = i % 2 === 0;
            const y = THREAD.top + THREAD.row * (i + .5);
            const x = threadX(y / (THREAD.top + THREAD.row * chapters.length));
            return (
              <div key={ch.n} style={{ height: THREAD.row, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                <div className="sv-story" style={{ gridColumn: left ? 1 : 2, padding: left ? '0 40px 0 6px' : '0 6px 0 40px', textAlign: left ? 'right' : 'left' }}>
                  {ch.year && <div style={{ display: 'inline-block', padding: '4px 10px', background: SAGE, color: PAPER, borderRadius: 999, font: "400 9px/1 'Archivo'", letterSpacing: '.2em' }}>{ch.year}</div>}
                  <div className="bl-display" style={{ marginTop: 6, fontSize: 28, lineHeight: 1.1 }}>{ch.title}</div>
                  <div style={{ marginTop: 5, font: "200 11.5px/1.6 var(--f-body)", opacity: .74, textWrap: 'pretty' } as CSSProperties}>{ch.body}</div>
                  <div style={{ position: 'relative', width: 60, height: 40, margin: left ? '8px 0 0 auto' : '8px 0 0', opacity: .6, animation: 'vFlutter ' + flutter[i] + ' ease-in-out infinite' }}>
                    <Orn slot={orns[ch.n - 1]} style={{ inset: 0, width: '100%', height: '100%' }} />
                  </div>
                </div>
                <div className="sv-knot" style={{ position: 'absolute', left: 'calc(50% + ' + x + 'px)', translate: '-50% -50%', top: y, width: 15, height: 15, borderRadius: '50%', background: RED, boxShadow: '0 0 0 4px #FBF6EC,0 0 0 6px rgba(169,50,39,.3)' }} />
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
    await copyText(url);
    setShared(true);
    window.setTimeout(() => setShared(false), 1800);
  };
  const pill: CSSProperties = { flex: 1, textAlign: 'center', padding: 15, borderRadius: 999, font: "400 10px/1 'Archivo'", letterSpacing: '.22em', textTransform: 'uppercase' };
  return (
    <section className="bl-sec" data-screen-label="Lokasi" style={{ position: 'relative', padding: '72px 24px' }}>
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 20 }}>
        <Kicker>{t.locKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 41 }}>{cfg.venue}</h2>
        <div style={{ marginTop: 6, font: "200 12.5px/1.7 var(--f-body)", opacity: .76 }}>{cfg.address}</div>
      </div>
      <div className="sv-wipe bl-clip" style={{ position: 'relative', height: 240, borderRadius: 18, border: '1px solid rgba(74,83,67,.16)', background: '#E4DECD' }}>
        <iframe src={'https://maps.google.com/maps?q=' + q + '&z=15&output=embed'} title="Peta lokasi" style={{ width: '100%', height: '100%', border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <a href={'https://www.google.com/maps/search/?api=1&query=' + q} target="_blank" rel="noreferrer" style={{ ...pill, background: SAGE, color: PAPER }}>{t.directions}</a>
        <button className="bl-btn" onClick={onShare} style={{ ...pill, background: 'transparent', border: '1px solid rgba(74,83,67,.35)', color: SAGE }}>{shared ? t.shared : t.share}</button>
      </div>
    </section>
  );
}

type GuestInfo = { id: string; name: string };

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
  const key = 'rsvp:' + (guest.id || 'anon');
  const saved = useMemo<RsvpSaved | null>(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }, [key]);
  const [name, setName] = useState(saved?.name || guest.name);
  useAutoName(guest.name, name, setName, !!saved);
  const [attend, setAttend] = useState<'yes' | 'no' | null>(saved?.attend || null);
  const [guests, setGuests] = useState(saved?.guests || 1);
  const [done, setDone] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Separate from `err`: only a failed send is worth offering a retry for,
  // a missing name is not.
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setErr(t.needName);
    if (!attend) return setErr(t.pickAttend);
    setErr(''); setFailed(false); setBusy(true);
    try {
      if (!preview && sheetsReady) {
        await sheets.rsvp({ guestId: guest.id || slug(name), name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
      }
      const rec: RsvpSaved = { name: name.trim(), attend, guests };
      try { localStorage.setItem(key, JSON.stringify(rec)); } catch { /* ignore */ }
      setDone(true);
    } catch {
      // Park it so the answer is not lost if this guest never comes back to retry.
      if (!preview && sheetsReady) {
        queueRsvp({ key, guestId: guest.id || slug(name), name: name.trim(), rsvp: attend, guests: attend === 'yes' ? guests : 0 });
      }
      setErr(t.sendFailed);
      setFailed(true);
    } finally { setBusy(false); }
  };

  const choice = (on: boolean, bg: string, fg: string): CSSProperties => ({
    padding: 15, border: '1px solid rgba(74,83,67,.16)', background: on ? bg : PAPER, color: on ? fg : INK,
    borderRadius: 11, font: "400 10px/1 'Archivo'", letterSpacing: '.18em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background .25s, color .25s'
  });
  const round: CSSProperties = { width: 34, height: 34, border: '1px solid rgba(74,83,67,.2)', background: PAPER, borderRadius: '50%', cursor: 'pointer', font: "400 15px/1 'Archivo'" };

  return (
    <section className="bl-sec" data-screen-label="RSVP" style={{ position: 'relative', padding: '74px 24px', background: SAGE, color: PAPER }}>
      <div style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Kicker color={GOLD}>RSVP</Kicker>
          <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 43 }}>{t.rsvpTitle}</h2>
          <div style={{ marginTop: 6, font: "200 12px/1.7 var(--f-body)", opacity: .78 }}>{t.rsvpSub}</div>
        </div>
        {!done ? (
          <div style={{ display: 'grid', gap: 11, padding: 22, background: CARD, color: INK, borderRadius: 20, boxShadow: '0 18px 42px rgba(33,36,28,.28)' }}>
            <input className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} aria-label={t.namePh} autoComplete="name" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <button onClick={() => setAttend('yes')} aria-pressed={attend === 'yes'} style={choice(attend === 'yes', SAGE, PAPER)}>{t.attend}</button>
              <button onClick={() => setAttend('no')} aria-pressed={attend === 'no'} style={choice(attend === 'no', RED, CARD)}>{t.notAttend}</button>
            </div>
            {attend !== 'no' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 9, alignItems: 'center', padding: '4px 2px' }}>
                <span style={{ font: "300 12px/1.5 var(--f-body)", opacity: .8 }}>{t.guestCount}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={round} aria-label="−">&minus;</button>
                  <span className="bl-serif" style={{ minWidth: 22, textAlign: 'center', fontSize: 19 }}>{guests}</span>
                  <button onClick={() => setGuests(g => Math.min(20, g + 1))} style={round} aria-label="+">+</button>
                </div>
              </div>
            )}
            {err && (
              <div className="bl-msg" role="alert">
                {err}
                {failed && (
                  <button onClick={submit} disabled={busy}
                    style={{ marginLeft: 8, padding: '5px 12px', background: 'transparent', border: '1px solid currentColor', borderRadius: 999, color: 'inherit', font: "400 10px/1 'Archivo'", letterSpacing: '.14em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer' }}>
                    {t.retry}
                  </button>
                )}
              </div>
            )}
            <button className="bl-btn" onClick={submit} disabled={busy} style={{ padding: 16, background: SAGE, color: PAPER, borderRadius: 11 }}>{busy ? t.sending : t.sendRsvp}</button>
          </div>
        ) : (
          <div style={{ padding: '28px 24px', textAlign: 'center', background: CARD, color: INK, borderRadius: 20, animation: 'vPop .6s both' }}>
            <div style={{ position: 'relative', width: 68, height: 68, margin: '0 auto 8px', opacity: .9, animation: 'vFloat 6s ease-in-out infinite' }}>
              <Orn slot="orn-rsvp-done" style={{ inset: 0, width: '100%', height: '100%' }} />
            </div>
            <div className="bl-display" style={{ fontSize: 32, lineHeight: 1.2 }}>{t.thanks} {name}</div>
            <div style={{ marginTop: 8, font: "200 12.5px/1.7 var(--f-body)", opacity: .72 }}>
              {attend === 'no' ? t.wontAttend : t.willAttend.replace('{n}', String(guests))}
            </div>
            {attend === 'yes' && guest.id && (
              <div style={{ margin: '18px auto 0', padding: '16px 16px 12px', width: 'max-content', background: PAPER, border: '1px solid rgba(74,83,67,.14)', borderRadius: 16 }}>
                <div className="bl-kicker" style={{ marginBottom: 10 }}>{t.qrTitle}</div>
                <QRCodeCanvas value={location.origin + '/checkin?g=' + encodeURIComponent(guest.id)} size={132} marginSize={1} fgColor={DEEP} bgColor={PAPER} />
                <div style={{ marginTop: 8, maxWidth: 150, font: "200 10.5px/1.5 var(--f-body)", opacity: .7 }}>{t.qrNote}</div>
              </div>
            )}
            <button className="bl-btn" onClick={() => setDone(false)} style={{ marginTop: 14, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(74,83,67,.3)', font: "400 9px/1 'Archivo'", letterSpacing: '.2em' }}>{t.change}</button>
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
    sheets.listWishes().then(ws => setList(ws.map(w => ({ id: w.id, name: w.name, text: w.text, createdAt: w.createdAt })))).catch(() => {});
  }, []);

  const submit = async () => {
    const n = name.trim(), w = text.trim();
    if (!n || !w) { setNote(!n ? t.needName : t.needWish); return; }
    const mine: WishView = { id: 'local-' + Date.now(), name: n, text: w, createdAt: new Date().toISOString(), mine: true };
    setBusy(true);
    try {
      if (!preview && sheetsReady) await sheets.addWish({ name: n, text: w, guestId: guest.id });
      setList(l => [mine, ...l]);
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
          <div style={{ marginTop: 6, font: "200 12px/1.7 var(--f-body)", opacity: .7 }}>{t.wishSub}</div>
        </div>
        <div style={{ display: 'grid', gap: 11, padding: 22, background: CARD, border: '1px solid rgba(74,83,67,.12)', borderRadius: 20 }}>
          <input className="bl-field" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} aria-label={t.namePh} />
          <textarea className="bl-field" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={t.wishPh} aria-label={t.wishPh} maxLength={600} />
          {note && <div className="bl-msg" style={{ color: note === t.wishPending ? SAGE : RED }}>{note}</div>}
          <button className="bl-btn" onClick={submit} disabled={busy} style={{ padding: 16, background: RED, color: CARD, borderRadius: 11 }}>{busy ? t.sending : t.sendWish}</button>
        </div>
        <div style={{ marginTop: 22, display: 'grid', gap: 10 }}>
          {list.map(w => (
            <div key={w.id} className="sv-wish" style={{ padding: '16px 18px', background: '#F4EFE2', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ font: "400 11px/1 'Archivo'", letterSpacing: '.12em', color: RED }}>{w.name}</span>
                <span style={{ font: "200 9px/1 'Archivo'", letterSpacing: '.16em', textTransform: 'uppercase', opacity: .45 }}>{fmtWhen(w.createdAt, t)}</span>
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
  if (cfg.bank1Acct) cards.push({ key: 'b1', slot: 'orn-gift-1', label: cfg.bank1Name || 'Bank', kind: t.transfer, value: cfg.bank1Acct, holder: cfg.bank1Holder ? t.holderPrefix + cfg.bank1Holder : '', bg: 'linear-gradient(155deg,#4A5343,#3B4235)', fg: PAPER, btnBg: GOLD, btnFg: DEEP, size: 27, copyLabel: t.copy });
  if (cfg.bank2Acct) cards.push({ key: 'b2', slot: 'orn-gift-2', label: cfg.bank2Name || 'Bank', kind: t.transfer, value: cfg.bank2Acct, holder: cfg.bank2Holder ? t.holderPrefix + cfg.bank2Holder : '', bg: GOLD, fg: '#3B3730', btnBg: SAGE, btnFg: PAPER, size: 27, copyLabel: t.copy });
  if (cfg.giftAddress) cards.push({ key: 'addr', slot: 'orn-gift-3', label: cfg.giftAddressLabel || (lang === 'en' ? 'Send a Gift' : 'Kirim Hadiah'), kind: t.addressKind, value: cfg.giftAddress, holder: cfg.giftAddressHolder, bg: CARD, fg: INK, btnBg: RED, btnFg: CARD, size: 17, copyLabel: t.copyAddr });
  return cards;
}

function GiftSection({ cfg, t, onOpen }: S & { onOpen: () => void }) {
  if (!cfg.bank1Acct && !cfg.bank2Acct && !cfg.giftAddress) return null;
  return (
    <section className="bl-sec" data-screen-label="Amplop" style={{ position: 'relative', padding: '74px 24px' }}>
      <Orn slot="orn-amplop" style={{ left: '50%', top: 24, translate: '-50% 0', width: 190, height: 107, opacity: .42, animation: 'vFloat 11s ease-in-out infinite' }} />
      <div style={{ position: 'relative', textAlign: 'center', paddingTop: 24 }}>
        <Kicker>{t.giftKicker}</Kicker>
        <h2 className="bl-display" style={{ margin: '6px 0 0', fontSize: 43 }}>{t.giftTitle}</h2>
        <p style={{ maxWidth: 310, margin: '12px auto 0', font: "200 12.5px/1.8 var(--f-body)", opacity: .74, textWrap: 'pretty' } as CSSProperties}>{t.giftBody}</p>
        <button className="bl-btn" onClick={onOpen} style={{ marginTop: 22, padding: '16px 30px', background: SAGE, color: PAPER, boxShadow: '0 12px 28px rgba(74,83,67,.24)', animation: 'vBeat 5s 2s ease-in-out infinite' }}>{t.giftOpen}</button>
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
  const doCopy = (key: string, value: string) => {
    copyText(key === 'addr' ? value : value.replace(/\s/g, ''));
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
            <div style={{ font: "400 9px/1 'Archivo'", letterSpacing: '.32em', textTransform: 'uppercase', color: RED }}>{t.giftKicker}</div>
            <div className="bl-display" style={{ marginTop: 2, fontSize: 36, lineHeight: 1.1 }}>{t.giftTitle}</div>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ width: 32, height: 32, border: '1px solid rgba(51,48,42,.18)', background: 'transparent', borderRadius: '50%', cursor: 'pointer', font: "300 15px/1 'Archivo'" }}>&times;</button>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {giftCards(cfg, t, lang).map(g => (
            <div className="bl-clip" key={g.key} style={{ position: 'relative', padding: 20, background: g.bg, color: g.fg, borderRadius: 18 }}>
              <Orn slot={g.slot} style={{ right: -24, bottom: -20, width: 104, height: 104, opacity: .22 }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ font: "400 9px/1 'Archivo'", letterSpacing: '.26em', textTransform: 'uppercase', opacity: .85 }}>{g.label}</span>
                <span style={{ font: "300 9px/1 'Archivo'", letterSpacing: '.16em', textTransform: 'uppercase', opacity: .6 }}>{g.kind}</span>
              </div>
              <div className="bl-serif" style={{ position: 'relative', marginTop: 12, fontSize: g.size, lineHeight: 1.25, letterSpacing: '.02em', whiteSpace: 'pre-line' }}>{g.value.trim()}</div>
              {g.holder && <div style={{ position: 'relative', marginTop: 6, font: "200 12px/1.6 var(--f-body)", opacity: .8 }}>{g.holder}</div>}
              <button className="bl-btn" onClick={() => doCopy(g.key, g.value)} style={{ position: 'relative', marginTop: 16, width: '100%', padding: 13, background: g.btnBg, color: g.btnFg, borderRadius: 10, letterSpacing: '.22em' }}>
                {copied === g.key ? t.copied : g.copyLabel}
              </button>
            </div>
          ))}
        </div>
        <p style={{ margin: '16px 4px 0', font: "200 11.5px/1.7 var(--f-body)", opacity: .6, textAlign: 'center', textWrap: 'pretty' } as CSSProperties}>{t.giftNote}</p>
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
      <div style={{ font: "400 9px/1.4 'Archivo'", letterSpacing: '.34em', textTransform: 'uppercase', color: GOLD, opacity: .9 }}>{t.tagKicker}</div>
      <div className="bl-display" style={{ fontSize: 30, lineHeight: 1.2, color: GOLD, overflowWrap: 'anywhere', maxWidth: '100%' }}>{shown}</div>
    </div>
  );
}

function Closing({ cfg, t, coupleShort }: S & { coupleShort: string }) {
  const year = String(safeDate(cfg.dateISO).getFullYear());
  return (
    <section className="bl-sec" data-screen-label="Penutup" style={{ position: 'relative', padding: '80px 26px 34px', background: SAGE, color: PAPER, textAlign: 'center' }}>
      <CornerOrn slot="orn-penutup-l" at="bl" width="min(40%, 186px)" inset={0} opacity={.55} secs={14} />
      <CornerOrn slot="orn-penutup-l" at="br" width="min(40%, 186px)" inset={0} opacity={.55} secs={14} />
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative', width: 120, height: 106, margin: '0 auto 18px', filter: 'invert(1)', animation: 'vFloat 7s ease-in-out infinite' }}>
          <Orn slot="v-monogram" style={{ inset: 0, width: '100%', height: '100%' }} />
        </div>
        <Hashtag tag={cfg.hashtag} t={t} />
        <p style={{ maxWidth: 290, margin: '0 auto', font: "200 12.5px/1.9 var(--f-body)", opacity: .84, textWrap: 'pretty' } as CSSProperties}>{t.closing}</p>
        <div className="bl-display" style={{ marginTop: 18, fontSize: 56, lineHeight: 1.1 }}>{coupleShort}</div>
        <div style={{ marginTop: 8, font: "300 9px/1 'Archivo'", letterSpacing: '.42em', textTransform: 'uppercase', opacity: .65 }}>{t.withFamily}</div>
      </div>
      <div style={{ position: 'relative', marginTop: 46, padding: '16px 0 78px', borderTop: '1px solid rgba(251,246,236,.2)', display: 'grid', gap: 6, justifyItems: 'center' }}>
        <div style={{ font: "300 9px/1.6 'Archivo'", letterSpacing: '.24em', textTransform: 'uppercase', opacity: .62 }}>{t.watermark}</div>
        <div className="bl-batang" style={{ fontSize: 12, opacity: .5 }}>{coupleShort} &middot; {year}</div>
      </div>
    </section>
  );
}
