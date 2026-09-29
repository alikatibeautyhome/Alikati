'use client';

import * as React from 'react';
import Image from 'next/image';
import { Download, Share, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Chrome/Edge/Android fire this; Safari does not. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'abh-install-dismissed-at';
const DISMISS_DAYS = 14;
const SHOW_AFTER_MS = 9000;
const CONSENT_KEY = 'abh-cookie-choice';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari predates display-mode support.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function dismissedRecently(): boolean {
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
}

/**
 * "Install the app" prompt.
 *
 * Two paths:
 *  • Chrome / Edge / Android expose `beforeinstallprompt`, so the button installs the app in
 *    one tap via the browser's own dialog.
 *  • iOS Safari has no such API — Apple requires the user to use Share → Add to Home Screen,
 *    so we show those instructions instead.
 *
 * The prompt is intentionally delayed, waits until the cookie notice has been answered, and
 * stays quiet for two weeks after "Not now". It never appears on a desktop browser, in an
 * already-installed app, or when the owner has switched it off in admin settings.
 */
export function InstallPrompt({
  enabled,
  text,
}: {
  enabled: boolean;
  text?: string | null;
}) {
  const [visible, setVisible] = React.useState(false);
  const [iosMode, setIosMode] = React.useState(false);
  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    if (isStandalone() || dismissedRecently()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const reveal = () => {
      // Never compete with the cookie notice for the same corner of the screen.
      if (!window.localStorage.getItem(CONSENT_KEY)) {
        timer = setTimeout(reveal, 4000);
        return;
      }
      setVisible(true);
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferred.current = event as BeforeInstallPromptEvent;
      setIosMode(false);
      if (!timer) timer = setTimeout(reveal, SHOW_AFTER_MS);
    };

    const onInstalled = () => {
      setVisible(false);
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt — offer the manual route instead.
    if (isIos()) {
      setIosMode(true);
      timer = setTimeout(reveal, SHOW_AFTER_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  }

  async function install() {
    const event = deferred.current;
    if (!event) return;

    await event.prompt();
    const { outcome } = await event.userChoice;

    if (outcome !== 'accepted') dismiss();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      aria-label="Install the Alikati app"
      className={cn(
        // On phones this sits above the floating WhatsApp button (which occupies the bottom
        // ~76px on the right) rather than underneath it — the button is higher in the stack and
        // was covering this card's dismiss controls.
        'fixed inset-x-3 bottom-20 z-30 animate-slide-up rounded-2xl border border-charcoal/10 bg-white p-4 shadow-lift',
        'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 sm:p-5'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="logo-badge h-11 w-11">
          <Image
            src="/media/logo.jpg"
            alt=""
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-charcoal">Install the app</p>
          <p className="mt-1 text-sm text-charcoal-soft">
            {text ??
              'Add Alikati Beauty Home to your home screen for faster checkout and order updates.'}
          </p>

          {iosMode ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-blush-50 p-3 text-sm text-charcoal">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
              <span>
                Tap the <strong>Share</strong> button in Safari, then choose{' '}
                <strong>Add to Home Screen</strong>.
              </span>
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={install}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-rose-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install app
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-charcoal/15 px-4 text-sm font-medium text-charcoal-soft transition-colors hover:text-charcoal"
              >
                Not now
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
