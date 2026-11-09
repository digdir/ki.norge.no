import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  ErrorSummary,
  Field,
  Fieldset,
  Heading,
  Label,
  Paragraph,
  Radio,
  Select,
  Tag,
  Textfield,
  ValidationMessage,
} from '@digdir/designsystemet-react';
import { ArrowLeftIcon, CheckmarkCircleIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons';
import { ANNET, FAGOMRADER, FASER, KI_TYPER, LEVERANSER } from '../../lib/ki-tiltak';
import { ORGNR_LENGTH } from './organisationNumber';
import TurnstileWidget from './TurnstileWidget';
import {
  DESCRIPTION_MAX,
  newPartnerRow,
  emptyForm,
  type PartnerOrg,
  type TiltakForm,
} from './tiltakForm';
import {
  errorFor,
  validateTiltakForm,
  type ValidationError,
  type FieldKey,
} from './validateTiltakForm';

interface Props {
  /**
   * Public Turnstile key, sent from ki-tiltak/del.astro. An empty string means
   * Turnstile is not configured, and then no widget is shown. The server lets
   * the submission through in that case, but logs it.
   */
  turnstileSiteKey: string;
}

const OVERVIEW_URL = '/ki-tiltak';

/**
 * The DOM id the error summary jumps to, derived from the field key.
 * Derived rather than looked up in a table, so that a new field cannot be
 * left without an anchor.
 */
function fieldId(field: FieldKey): string {
  return `tiltak-${field.replace(/:/g, '-')}`;
}

/**
 * An organisation number is nine digits and nothing else.
 *
 * Filters out everything that is not a digit while the user types, and cuts at nine.
 * maxLength alone is not enough: it stops typing, but not pasting, and a
 * pasted "org 123 456 789 00" would otherwise become twelve digits.
 */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, ORGNR_LENGTH);
}

/** "Må fylles ut" / "Valgfritt" next to the label, as the design shows. */
function Badge({ required }: { required: boolean }) {
  return (
    <Tag
      data-color={required ? 'warning' : 'info'}
      data-size="sm"
      className="tiltak-merke"
    >
      {required ? 'Må fylles ut' : 'Valgfritt'}
    </Tag>
  );
}

/**
 * The label with the badge inside it. The badge thus becomes part of the accessible
 * name, that is "Virksomhet, Må fylles ut", which is intended. The fields therefore
 * do not also get required, because then screen readers would say it twice.
 */
function labelWithBadge(text: string, required: boolean) {
  return (
    <>
      {text}
      <Badge required={required} />
    </>
  );
}

export default function RegisterTiltakForm({ turnstileSiteKey }: Props) {
  const [form, setForm] = useState<TiltakForm>(emptyForm);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  /** Empty string until the widget has given us a token. */
  const [turnstileToken, setTurnstileToken] = useState('');
  /** Incremented to ask the widget for a new token. The token is single-use. */
  const [turnstileReset, setTurnstileReset] = useState(0);
  // <ds-error-summary> moves focus to itself when it is inserted into the DOM
  // (0s CSS animation + animationend handling in its own connectedCallback).
  // That only triggers on insertion, so a second failed attempt must
  // be remounted to get focus back. forsok as key forces that remount.
  const [attempt, setAttempt] = useState(0);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the receipt, since the submit button is gone.
  useEffect(() => {
    if (!sent) return;
    window.scrollTo({ top: 0 });
    receiptHeadingRef.current?.focus();
  }, [sent]);

  const update = (field: keyof TiltakForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  /**
   * On and off for a checkbox group.
   *
   * The order is taken from the option list and not from the click order, so that
   * the email to the editors always lists them the same way. The free text field is cleared when
   * "Annet" is unticked again, otherwise an old value would be sent along.
   */
  const toggleMulti =
    (field: 'kiType', options: readonly string[], annetField: keyof TiltakForm) =>
    (value: string) =>
      setForm((previous) => {
        const chosen = previous[field];
        const next = chosen.includes(value)
          ? chosen.filter((item) => item !== value)
          : [...chosen, value];
        return {
          ...previous,
          [field]: options.filter((option) => next.includes(option)),
          ...(next.includes(ANNET) ? {} : { [annetField]: '' }),
        };
      });

  const updateRow = (id: string, field: keyof PartnerOrg) => (value: string) =>
    setForm((previous) => ({
      ...previous,
      samarbeid: previous.samarbeid.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));

  // After adding a row, focus its first field. After deleting one, the delete
  // button is gone, so focus the add button instead.
  const focusRowId = useRef<string | null>(null);
  const focusAddButton = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusRowId.current) {
      document.getElementById(fieldId(`samarbeid:${focusRowId.current}:navn`))?.focus();
      focusRowId.current = null;
    } else if (focusAddButton.current) {
      addButtonRef.current?.focus();
      focusAddButton.current = false;
    }
  }, [form.samarbeid]);

  const addRow = () => {
    const row = newPartnerRow();
    focusRowId.current = row.id;
    setForm((previous) => ({ ...previous, samarbeid: [...previous.samarbeid, row] }));
  };

  const removeRow = (id: string) => {
    focusAddButton.current = true;
    setForm((previous) => ({
      ...previous,
      samarbeid: previous.samarbeid.filter((row) => row.id !== id),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTiltakForm(form);
    setErrors(found);
    if (found.length > 0) {
      setAttempt((previous) => previous + 1);
      return;
    }

    setSending(true);
    setSendFailed(false);
    setRateLimited(false);
    try {
      const response = await fetch('/api/ki-tiltak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      // The route responds 202 when Graph has accepted the message.
      if (!response.ok) {
        // 429 is too many attempts from the same place. It is the one error
        // the user can do something about, so it gets its own message.
        if (response.status === 429) setRateLimited(true);
        else setSendFailed(true);
        return;
      }
      setSent(true);
    } catch {
      // Network error. Same message as for an error on our side, since the user
      // should do the same thing either way.
      setSendFailed(true);
    } finally {
      setSending(false);
      // The token is used up, however it went. On success the receipt
      // is shown and the widget disappears; otherwise the next attempt needs a
      // new token.
      setTurnstileToken('');
      setTurnstileReset((previous) => previous + 1);
    }
  };

  const message = (field: FieldKey) => errorFor(errors, field);

  if (sent) {
    return (
      <div className="tiltak-registrer tiltak-suksess">
        <CheckmarkCircleIcon aria-hidden className="tiltak-suksess-ikon" />
        <Heading
          ref={receiptHeadingRef}
          tabIndex={-1}
          level={1}
          data-size="lg"
          className="tiltak-registrer-tittel"
        >
          Takk for at du deler!
        </Heading>
        <Paragraph>
          Vi publiserer tiltaket på ki.norge.no innen 10 dager. Før vi publiserer går vi gjennom
          teksten for å vurdere om teksten er klar og tydelig. Du hører fra oss hvis vi lurer på
          noe.
        </Paragraph>
        <Button asChild>
          <a href={OVERVIEW_URL}>Tilbake til oversikten</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="tiltak-registrer">
      <a href={OVERVIEW_URL} className="tiltak-registrer-tilbake ds-link">
        <ArrowLeftIcon aria-hidden />
        Tilbake til oversikten
      </a>

      <Heading level={1} data-size="lg" className="tiltak-registrer-tittel">
        Del KI&#8209;tiltak
      </Heading>
      <div className="tiltak-registrer-ingress">
        <Paragraph>
          Her kan du som jobber i en offentlig virksomhet dele hvordan dere utforsker eller bruker
          KI. Tiltaket kan være en tidlig utprøving, et pågående prosjekt eller en løsning dere
          bruker.
        </Paragraph>
        <Paragraph>
          Beskriv tiltaket kort og i klarspråk. Vi går gjennom informasjonen før vi publiserer, og
          tar kontakt om vi lurer på noe.
        </Paragraph>
      </div>

      <form onSubmit={handleSubmit} noValidate className="tiltak-skjema">
        <div className="tiltak-seksjon">
          <Textfield
            id={fieldId('ansvarligNavn')}
            label={labelWithBadge('Virksomhet', true)}
            value={form.ansvarligNavn}
            error={message('ansvarligNavn')}
            onChange={(event) => update('ansvarligNavn')(event.target.value)}
          />
          <Textfield
            id={fieldId('ansvarligOrgnr')}
            label={labelWithBadge('Organisasjonsnummer', true)}
            description="Ni siffer."
            inputMode="numeric"
            autoComplete="off"
            maxLength={ORGNR_LENGTH}
            value={form.ansvarligOrgnr}
            error={message('ansvarligOrgnr')}
            onChange={(event) => update('ansvarligOrgnr')(onlyDigits(event.target.value))}
          />

          {form.samarbeid.map((row, index) => (
            <div key={row.id} className="tiltak-samarbeidsrad">
              <div className="tiltak-samarbeidsrad-topp">
                <Button
                  type="button"
                  variant="tertiary"
                  data-size="sm"
                  onClick={() => removeRow(row.id)}
                  aria-label={`Slett samarbeidsvirksomhet ${index + 1}`}
                >
                  <TrashIcon aria-hidden />
                  Slett
                </Button>
              </div>
              <Textfield
                id={fieldId(`samarbeid:${row.id}:navn`)}
                label={labelWithBadge('Virksomhet', true)}
                value={row.navn}
                error={message(`samarbeid:${row.id}:navn`)}
                onChange={(event) => updateRow(row.id, 'navn')(event.target.value)}
              />
              <Textfield
                id={fieldId(`samarbeid:${row.id}:orgnr`)}
                label={labelWithBadge('Organisasjonsnummer', true)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={ORGNR_LENGTH}
                value={row.orgnr}
                error={message(`samarbeid:${row.id}:orgnr`)}
                onChange={(event) => updateRow(row.id, 'orgnr')(onlyDigits(event.target.value))}
              />
            </div>
          ))}

          <Button
            type="button"
            variant="tertiary"
            data-size="sm"
            className="tiltak-legg-til"
            ref={addButtonRef}
            onClick={addRow}
          >
            <PlusIcon aria-hidden />
            Legg til virksomhet
          </Button>
        </div>

        <div className="tiltak-seksjon">
          <Textfield
            id={fieldId('navn')}
            label={labelWithBadge('Tiltakets navn', true)}
            description="Vises som overskrift i oversikten på ki.norge.no. Skriv kort og informativt, unngå virksomhetens navn."
            value={form.navn}
            error={message('navn')}
            onChange={(event) => update('navn')(event.target.value)}
          />
          <Textfield
            id={fieldId('beskrivelse')}
            multiline
            rows={5}
            maxLength={DESCRIPTION_MAX}
            counter={DESCRIPTION_MAX}
            label={labelWithBadge('Beskriv tiltaket', true)}
            description={`Hva skal KI løse, hvem er målgruppen og hva gjør dere? Maks ${DESCRIPTION_MAX} tegn.`}
            value={form.beskrivelse}
            error={message('beskrivelse')}
            onChange={(event) => update('beskrivelse')(event.target.value)}
          />
          <Field>
            <Label htmlFor={fieldId('fagomrade')}>{labelWithBadge('Tema', true)}</Label>
            <Select
              id={fieldId('fagomrade')}
              value={form.fagomrade}
              aria-invalid={message('fagomrade') !== undefined || undefined}
              onChange={(event) => update('fagomrade')(event.target.value)}
            >
              <Select.Option value="">Velg tema</Select.Option>
              {FAGOMRADER.map((fagomrade) => (
                <Select.Option key={fagomrade} value={fagomrade}>
                  {fagomrade}
                </Select.Option>
              ))}
            </Select>
            {message('fagomrade') !== undefined && (
              <ValidationMessage>{message('fagomrade')}</ValidationMessage>
            )}
          </Field>
        </div>

        <div className="tiltak-seksjon">
          <Fieldset className="tiltak-valg-felt">
            <Fieldset.Legend>
              {labelWithBadge('Hvilken fase er tiltaket i?', true)}
            </Fieldset.Legend>
            {FASER.map((fase, index) => (
              <Radio
                key={fase}
                // Only the first radio button gets the anchor, so that the link
                // in the error summary lands on a focusable element.
                id={index === 0 ? fieldId('fase') : undefined}
                name="tiltak-fase"
                label={fase}
                value={fase}
                checked={form.fase === fase}
                onChange={(event) => update('fase')(event.target.value)}
              />
            ))}
            {message('fase') !== undefined && (
              <ValidationMessage>{message('fase')}</ValidationMessage>
            )}
          </Fieldset>

          <Fieldset className="tiltak-valg-felt">
            <Fieldset.Legend>
              {labelWithBadge('Hva skal tiltaket levere?', true)}
            </Fieldset.Legend>
            {LEVERANSER.map((leveranse, index) => (
              <Radio
                key={leveranse}
                id={index === 0 ? fieldId('leveranse') : undefined}
                name="tiltak-leveranse"
                label={leveranse}
                value={leveranse}
                checked={form.leveranse === leveranse}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    leveranse: event.target.value,
                    // The free text belongs to "Annet". If the choice changes, it must not be sent along.
                    ...(event.target.value === ANNET ? {} : { leveranseAnnet: '' }),
                  }))
                }
              />
            ))}
            {message('leveranse') !== undefined && (
              <ValidationMessage>{message('leveranse')}</ValidationMessage>
            )}
          </Fieldset>

          {form.leveranse === ANNET && (
            <Textfield
              id={fieldId('leveranseAnnet')}
              label="Beskriv nærmere"
              value={form.leveranseAnnet}
              error={message('leveranseAnnet')}
              onChange={(event) => update('leveranseAnnet')(event.target.value)}
            />
          )}

          <Fieldset className="tiltak-valg-felt">
            <Fieldset.Legend>
              {labelWithBadge('Hvilken type KI bruker dere i tiltaket?', false)}
            </Fieldset.Legend>
            <Fieldset.Description>Du kan velge flere svar.</Fieldset.Description>
            {KI_TYPER.map((kiType) => (
              <Checkbox
                key={kiType}
                label={kiType}
                value={kiType}
                checked={form.kiType.includes(kiType)}
                onChange={() => toggleMulti('kiType', KI_TYPER, 'kiTypeAnnet')(kiType)}
              />
            ))}
          </Fieldset>

          {form.kiType.includes(ANNET) && (
            <Textfield
              label="Beskriv nærmere"
              value={form.kiTypeAnnet}
              onChange={(event) => update('kiTypeAnnet')(event.target.value)}
            />
          )}
        </div>

        <Textfield
          id={fieldId('kontaktinfo')}
          type="email"
          label={labelWithBadge('Kontaktinfo', true)}
          description="En e-postadresse folk kan bruke for å kontakte virksomheten din om tiltaket, for eksempel postmottak."
          value={form.kontaktinfo}
          error={message('kontaktinfo')}
          onChange={(event) => update('kontaktinfo')(event.target.value)}
        />

        <Fieldset className="tiltak-valg-felt">
          <Fieldset.Legend>{labelWithBadge('Samtykke', true)}</Fieldset.Legend>
          <Checkbox
            id={fieldId('samtykke')}
            label="Jeg samtykker til at Digdir kan lagre e-postadressen jeg har oppgitt og vise den på ki.norge.no."
            checked={form.samtykke}
            aria-invalid={message('samtykke') !== undefined || undefined}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, samtykke: event.target.checked }))
            }
          />
          {message('samtykke') !== undefined && (
            <ValidationMessage>{message('samtykke')}</ValidationMessage>
          )}
        </Fieldset>

        {sendFailed && (
          <Alert data-color="danger" className="tiltak-sendefeil">
            <Heading level={2} data-size="xs">
              Vi klarte ikke å sende inn tiltaket
            </Heading>
            <Paragraph data-size="sm">
              Prøv igjen om litt. Fortsetter det, send tiltaket til{' '}
              <a href="mailto:ki-tiltak@kin.norge.no">ki-tiltak@kin.norge.no</a> i stedet, så
              legger vi det inn manuelt.
            </Paragraph>
          </Alert>
        )}

        {rateLimited && (
          <Alert data-color="warning" className="tiltak-sendefeil">
            <Heading level={2} data-size="xs">
              Du har sendt inn mange tiltak på kort tid
            </Heading>
            <Paragraph data-size="sm">
              Vent et minutt og prøv igjen. Skal du dele flere tiltak på en gang, send dem til{' '}
              <a href="mailto:ki-tiltak@kin.norge.no">ki-tiltak@kin.norge.no</a>, så legger vi
              dem inn for deg.
            </Paragraph>
          </Alert>
        )}

        {turnstileSiteKey.length > 0 && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onToken={setTurnstileToken}
            resetKey={turnstileReset}
          />
        )}

        {errors.length > 0 && (
          <ErrorSummary key={attempt} className="tiltak-feiloppsummering">
            <ErrorSummary.Heading>Før du kan gå videre må rette følgende feil:</ErrorSummary.Heading>
            <ErrorSummary.List>
              {errors.map((item) => (
                <ErrorSummary.Item key={item.field}>
                  <ErrorSummary.Link href={`#${fieldId(item.field)}`}>
                    {item.message}
                  </ErrorSummary.Link>
                </ErrorSummary.Item>
              ))}
            </ErrorSummary.List>
          </ErrorSummary>
        )}
        <div className="tiltak-registrer-fot">
          <Button
            type="submit"
            className="tiltak-registrer-submit"
            loading={sending}
            disabled={sending}
          >
            {sending ? 'Sender…' : 'Del tiltak'}
          </Button>
          <Button variant="tertiary" asChild>
            <a href={OVERVIEW_URL}>Avbryt</a>
          </Button>
        </div>
      </form>
    </div>
  );
}
