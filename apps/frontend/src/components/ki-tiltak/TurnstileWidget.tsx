import { useEffect, useRef } from 'react';

/**
 * The Turnstile widget in "Del KI-tiltak".
 *
 * Rendered explicitly instead of with the implicit cf-turnstile class,
 * because React renders the form and can mount it after the script has loaded.
 * Implicit rendering only finds elements that existed when the script loaded.
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

/** The script loads once per page, no matter how many widgets ask for it. */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise !== null) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('turnstile did not load')));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  siteKey: string;
  /** Empty string means "no valid token right now". */
  onToken: (token: string) => void;
  /**
   * Changed to fetch a new token. The token is single-use, so the form must
   * reset the widget after a failed submission.
   */
  resetKey: number;
}

export default function TurnstileWidget({ siteKey, onToken, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Holds the latest callback without letting it trigger a re-render of the widget.
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
        // Without a widget there is no token, and the server rejects. The user
        // gets the usual error message from the form.
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
    // Skips the first run: the widget has just been rendered.
    if (resetKey === 0) return;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current('');
    }
  }, [resetKey]);

  return <div ref={containerRef} className="tiltak-turnstile" />;
}
