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
    consent: true,
  };
}

async function submit(hostname: string, overstyr: Partial<TiltakForm> = {}) {
  const request = new Request(`https://${hostname}/api/ki-tiltak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validForm(), ...overstyr, turnstileToken: 'token' }),
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
  test('passes the hostname from the request on to Turnstile', async () => {
    verifyTurnstile.mockResolvedValue('ok');
    await submit('ki.test.norge.no');
    expect(verifyTurnstile.mock.calls[0][2]).toBe('ki.test.norge.no');
  });

  test('responds 503 and sends nothing when Turnstile is missing the secret', async () => {
    verifyTurnstile.mockResolvedValue('not_configured');
    expect(await submit('ki.norge.no')).toEqual({
      status: 503,
      body: { error: 'turnstile_not_configured' },
    });
    expect(sendTiltakEmail).not.toHaveBeenCalled();
  });

  test('responds 403 as before when the token is rejected', async () => {
    verifyTurnstile.mockResolvedValue('rejected');
    expect(await submit('ki.norge.no')).toEqual({ status: 403, body: { error: 'turnstile_failed' } });
    expect(sendTiltakEmail).not.toHaveBeenCalled();
  });

  test('responds 400 and sends nothing without consent', async () => {
    verifyTurnstile.mockResolvedValue('ok');
    expect(await submit('ki.norge.no', { consent: false })).toEqual({
      status: 400,
      body: { error: 'validation', fields: ['consent'] },
    });
    expect(sendTiltakEmail).not.toHaveBeenCalled();
  });

  test('forwards when the token is accepted', async () => {
    verifyTurnstile.mockResolvedValue('ok');
    expect(await submit('ki.norge.no')).toEqual({ status: 202, body: { ok: true } });
    expect(sendTiltakEmail).toHaveBeenCalledOnce();
  });
});
