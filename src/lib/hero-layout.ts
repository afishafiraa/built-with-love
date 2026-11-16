export function lockHeroLayout(hero: HTMLElement) {
  let width = window.innerWidth;
  const capture = () => {
    hero.style.removeProperty('--hero-height');
    hero.style.removeProperty('--hero-safe-bottom');
    const height = hero.getBoundingClientRect().height;
    const safeBottom = getComputedStyle(hero).getPropertyValue('--hero-safe-bottom').trim();
    hero.style.setProperty('--hero-height', height + 'px');
    if (safeBottom) hero.style.setProperty('--hero-safe-bottom', safeBottom);
  };
  capture();
  const onResize = () => {
    // Mobile toolbar/keyboard changes must not move the artwork within the hero.
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    capture();
  };
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    hero.style.removeProperty('--hero-height');
    hero.style.removeProperty('--hero-safe-bottom');
  };
}
