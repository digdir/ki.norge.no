import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyForm, type TiltakForm } from '../../components/ki-tiltak/tiltakForm';

const verifyTurnstile = vi.fn();
const sendTiltakEmail = vi.fn();

vi.mock('../../lib/turnstile', () => ({ verifyTurnstile }));
vi.mock('../../lib/graph-email', () => ({ emailIsConfigured: true, sendTiltakEmail }));

const { POST } = await import('./ki-tiltak');

function validForm(): TiltakForm {
  return {
    ...emptyForm(),
    ansvarligNavn: 'Digitaliseringsdirektoratet',
    ansvarligOrgnr: '991825827',
    navn: 'KI lab',
    beskrivelse: 'Utforsker KI-løsninger for offentlige tjenester.',
    fagomrade: 'Digitale teknologier',
    kontaktinfo: 'postmottak@digdir.no',
    fase: 'Gjennomføring',
    leveranse: 'Pilot',
  };
}

async function submit(hostname: string) {
  const request = new Request(`https://${hostname}/api/ki-tiltak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validForm(), turnstileToken: 'token' }),
  });
  const response = await (POST as any)({ request });
  return { status: response.status as number, body: await response.json() };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendTiltakEmail.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  verifyTurnstile.mockReset();
  sendTiltakEmail.mockReset();
});

describe('POST /api/ki-tiltak', () => {
  test('sender vertsnavnet i forespørselen videre til Turnstile', async () => {
    verifyTurnstile.mockResolvedValue('ok');
    await submit('ki.test.norge.no');
    expect(verifyTurnstile.mock.calls[0][2]).toBe('ki.test.norge.no');
  });

  test('svarer 503 og sender ingenting når Turnstile mangler hemmeligheten', async () => {
    verifyTurnstile.mockResolvedValue('not_configured');
    expect(await submit('ki.norge.no')).toEqual({
      status: 503,
      body: { error: 'turnstile_not_configured' },
    });
    expect(sendTiltakEmail).not.toHaveBeenCalled();
  });

  test('svarer 403 som før når tokenet avvises', async () => {
    verifyTurnstile.mockResolvedValue('rejected');
    expect(await submit('ki.norge.no')).toEqual({ status: 403, body: { error: 'turnstile_failed' } });
    expect(sendTiltakEmail).not.toHaveBeenCalled();
  });

  test('sender videre når tokenet godtas', async () => {
    verifyTurnstile.mockResolvedValue('ok');
    expect(await submit('ki.norge.no')).toEqual({ status: 202, body: { ok: true } });
    expect(sendTiltakEmail).toHaveBeenCalledOnce();
  });
});
