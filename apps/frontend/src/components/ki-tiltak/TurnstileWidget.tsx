import { useEffect, useRef } from 'react';

/**
 * Turnstile-widgeten i «Del KI-tiltak».
 *
 * Rendres eksplisitt i stedet for med den implisitte cf-turnstile-klassen,
 * fordi skjemaet ligger i en dialog som monteres og demonteres. Implisitt
 * rendring finner bare elementer som fantes da skriptet lastet.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface RenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  language: string;
}

interface TurnstileApi {
  render(container: HTMLElement, options: RenderOptions): string | undefined;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Skriptet lastes én gang per side, uansett hvor mange widgets som ber om det. */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise !== null) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('turnstile lastet ikke')));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  siteKey: string;
  /** Tom streng betyr «ikke noe gyldig token nå». */
  onToken: (token: string) => void;
  /**
   * Endres for å hente et nytt token. Tokenet er engangs, så skjemaet må
   * nullstille widgeten etter en innsending som feilet.
   */
  resetKey: number;
}

export default function TurnstileWidget({ siteKey, onToken, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Holder siste callback uten å la den trigge ny rendring av widgeten.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current =
          window.turnstile.render(container, {
            sitekey: siteKey,
            callback: (token) => onTokenRef.current(token),
            'error-callback': () => onTokenRef.current(''),
            'expired-callback': () => onTokenRef.current(''),
            'timeout-callback': () => onTokenRef.current(''),
            language: 'nb',
          }) ?? null;
      })
      .catch(() => {
        // Uten widget finnes det ikke noe token, og serveren avviser. Brukeren
        // får den vanlige feilmeldingen fra skjemaet.
        onTokenRef.current('');
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    // Hopper over første kjøring: widgeten er nettopp rendret.
    if (resetKey === 0) return;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current('');
    }
  }, [resetKey]);

  return <div ref={containerRef} className="tiltak-turnstile" />;
}
