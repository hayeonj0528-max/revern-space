import { useEffect, useRef, type ReactNode } from 'react';

export function RoomHud({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <aside className={`room-hud ${className}`} aria-label={label}>{children}</aside>;
}

export function HudMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute('open'); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) { ref.current.removeAttribute('open'); ref.current.querySelector('summary')?.focus(); }
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  return <details ref={ref} className="hud-menu">
    <summary>{label}<span aria-hidden="true">⌃</span></summary>
    <div className="hud-menu-content" onClick={event => {
      if ((event.target as HTMLElement).closest('button')) { ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus(); }
    }}>{children}</div>
  </details>;
}
