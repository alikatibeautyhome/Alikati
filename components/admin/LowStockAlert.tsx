'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, PackageX, Volume2, VolumeX } from 'lucide-react';
import { getLowStockProducts, getSalonSettings } from '@/lib/api-client';
import { createStockAlertLink, isOutOfStock, type StockAlertProduct } from '@/lib/stock-alerts';
import { cn, normalizeWhatsAppNumber } from '@/lib/utils';

/**
 * Low-stock alert for the admin console.
 *
 * A bell in the header, a panel listing what needs restocking, a sound, and a one-tap WhatsApp
 * message to the owner.
 *
 * On the sound: browsers refuse to start audio until the page has seen a user gesture, so the
 * `AudioContext` is created suspended and resumed on the first interaction anywhere in the console.
 * The preference is remembered per browser. If a browser still blocks it, the panel keeps working
 * silently and the toggle explains why rather than failing without a word — hence the "tap to
 * enable" hint rather than an alert that simply never makes a noise.
 *
 * On WhatsApp: this project has no WhatsApp Business API integration, so nothing is sent
 * automatically. The button opens a pre-filled `wa.me` message for the owner to send, which is the
 * same pattern the rest of the site uses. See `lib/stock-alerts.ts`.
 */

/** Checked on mount and then every 60s — the same cadence as the appointment ribbon. */
const POLL_MS = 60_000;
const SOUND_PREF_KEY = 'alikati:stock-alert-sound';

export function LowStockAlert() {
  const [items, setItems] = useState<StockAlertProduct[]>([]);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [soundReady, setSoundReady] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  /** Signature of the last set we made a noise about, so a poll doesn't beep every minute. */
  const announced = useRef<string>('');

  // Restore the sound preference, then unlock audio on the first gesture.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_PREF_KEY) === 'off') setSoundOn(false);
    } catch {
      // Private mode — the default (on) is fine.
    }

    const unlock = () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!audioRef.current) audioRef.current = new Ctor();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
      setSoundReady(audioRef.current.state === 'running');
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== 'running') return;
    // Two short tones, synthesised: no audio asset to ship or fail to load.
    [0, 0.18].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = index === 0 ? 880 : 660;
      const at = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const [low, settings] = await Promise.all([getLowStockProducts(), getSalonSettings()]);
      setItems(low);
      setWhatsapp(settings.whatsapp_number ?? null);
    } catch {
      // Non-critical ribbon: a transient failure should not break the console.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // Sound once per distinct set of shortages, not once per poll.
  const signature = items.map((item) => `${item.id}:${item.stock_qty}`).join('|');
  useEffect(() => {
    if (!signature || !soundOn) return;
    if (announced.current === signature) return;
    announced.current = signature;
    chime();
  }, [signature, soundOn, chime]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off');
    } catch {
      // Preference is best-effort.
    }
    if (next) chime();
  }

  if (items.length === 0) {
    return (
      <span
        className="hidden items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success sm:inline-flex"
        title="Nothing is at or below its restock threshold."
      >
        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
        Stock OK
      </span>
    );
  }

  const outCount = items.filter(isOutOfStock).length;
  const alertHref = createStockAlertLink(items, whatsapp, normalizeWhatsAppNumber);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${items.length} products need restocking`}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
          outCount > 0
            ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
            : 'border-warn/25 bg-warn/10 text-warn hover:bg-warn/15'
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {outCount > 0 ? `${outCount} out of stock` : `${items.length} low`}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-soft dark:border-white/10 dark:bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-charcoal/10 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-semibold text-charcoal">Restock needed</p>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              className="inline-flex items-center gap-1.5 rounded-full border border-charcoal/15 px-2 py-1 text-[11px] font-medium text-charcoal-soft transition-colors hover:bg-charcoal/5 dark:border-white/15"
              title={
                soundOn && !soundReady
                  ? 'Click anywhere once so the browser allows sound, then test again.'
                  : soundOn
                    ? 'Alert sound is on'
                    : 'Alert sound is off'
              }
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
              {soundOn ? 'Sound on' : 'Sound off'}
            </button>
          </div>

          <ul className="max-h-72 divide-y divide-charcoal/5 overflow-y-auto dark:divide-white/5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link
                  href={`/admin/products?focus=${encodeURIComponent(item.slug)}`}
                  className="min-w-0 flex-1 truncate text-xs font-medium text-charcoal hover:text-rose-gold"
                  onClick={() => setOpen(false)}
                >
                  {item.name}
                </Link>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    isOutOfStock(item) ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'
                  )}
                >
                  {isOutOfStock(item) ? (
                    <span className="inline-flex items-center gap-1">
                      <PackageX className="h-3 w-3" aria-hidden="true" />
                      none left
                    </span>
                  ) : (
                    `${item.stock_qty} left`
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-charcoal/10 px-4 py-3 dark:border-white/10">
            {alertHref ? (
              <a
                href={alertHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Send this list on WhatsApp
              </a>
            ) : null}
            <p className="text-[11px] leading-relaxed text-charcoal-soft">
              Also flagged to every staff member who opens this console, and it re-checks every
              minute. WhatsApp opens with the message ready for you to send — nothing is sent
              automatically.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
