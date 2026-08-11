import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
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
import { CheckmarkCircleIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons';
import { FAGOMRADER, STATUSES } from '../../lib/ki-tiltak';
import { ORGNR_LENGTH } from './organisationNumber';
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
  open: boolean;
  onClose: () => void;
}

const REGISTER_DIALOG_ID = 'tiltak-registrer-dialog';

/**
 * DOM-id-en feiloppsummeringen hopper til, utledet av feltnøkkelen.
 * Utledet framfor slått opp i en tabell, slik at et nytt felt ikke kan bli
 * liggende uten anker.
 */
function fieldId(field: FieldKey): string {
  return `tiltak-${field.replace(/:/g, '-')}`;
}

/**
 * Organisasjonsnummer er ni siffer og ingenting annet.
 *
 * Siler bort alt som ikke er tall mens brukeren skriver, og kutter på ni.
 * maxLength alene holder ikke: den stopper tasting, men ikke innliming, og et
 * limt «org 123 456 789 00» ville ellers blitt til tolv siffer.
 */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, ORGNR_LENGTH);
}

/** «Må fylles ut» / «Valgfritt» ved siden av etiketten, slik designet viser. */
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
 * Etiketten med merket i seg. Merket blir dermed en del av det tilgjengelige
 * navnet, altså «Virksomhet, Må fylles ut», som er meningen. Feltene får
 * derfor ikke required i tillegg, for da ville skjermlesere sagt det to ganger.
 */
function labelWithBadge(text: string, required: boolean) {
  return (
    <>
      {text}
      <Badge required={required} />
    </>
  );
}

export default function RegisterTiltakDialog({ open, onClose }: Props) {
  const [form, setForm] = useState<TiltakForm>(emptyForm);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // <ds-error-summary> flytter fokus til seg selv når den settes inn i DOM-en
  // (0s CSS-animasjon + animationend-håndtering i egen connectedCallback).
  // Det trigges bare ved innsetting, så et andre mislykket forsøk må
  // remonteres for å få fokus tilbake. forsok som key tvinger den remonteringen.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setErrors([]);
    setSent(false);
    setSending(false);
    setSendFailed(false);
  }, [open]);

  const update = (field: keyof TiltakForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const updateRow = (id: string, field: keyof PartnerOrg) => (value: string) =>
    setForm((previous) => ({
      ...previous,
      samarbeid: previous.samarbeid.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));

  const addRow = () =>
    setForm((previous) => ({ ...previous, samarbeid: [...previous.samarbeid, newPartnerRow()] }));

  const removeRow = (id: string) =>
    setForm((previous) => ({
      ...previous,
      samarbeid: previous.samarbeid.filter((row) => row.id !== id),
    }));

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
    try {
      const response = await fetch('/api/ki-tiltak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      // Ruta svarer 202 når Graph har tatt imot meldingen.
      if (!response.ok) {
        setSendFailed(true);
        return;
      }
      setSent(true);
    } catch {
      // Nettverksfeil. Samme melding som ved feil hos oss, siden brukeren
      // uansett skal gjøre det samme.
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  };

  const message = (field: FieldKey) => errorFor(errors, field);

  return (
    <Dialog
      id={REGISTER_DIALOG_ID}
      open={open}
      onClose={onClose}
      closedby="closerequest"
      className="tiltak-registrer"
      aria-labelledby="tiltak-registrer-tittel"
    >
      {sent ? (
        <Dialog.Block className="tiltak-suksess">
          <CheckmarkCircleIcon aria-hidden className="tiltak-suksess-ikon" />
          <Heading
            id="tiltak-registrer-tittel"
            level={2}
            data-size="md"
            className="tiltak-registrer-tittel"
          >
            Takk for at du deler!
          </Heading>
          <Paragraph data-size="sm">
            Vi publiserer tiltaket på ki.norge.no innen 10 dager. Før vi publiserer går vi gjennom
            teksten for å vurdere om teksten er klar og tydelig. Du hører fra oss hvis vi lurer på
            noe.
          </Paragraph>
          <Button command="close" commandfor={REGISTER_DIALOG_ID}>
            Tilbake til oversikten
          </Button>
        </Dialog.Block>
      ) : (
        <>
          <Dialog.Block>
            <Heading
              id="tiltak-registrer-tittel"
              level={2}
              data-size="md"
              className="tiltak-registrer-tittel"
            >
              Del KI&#8209;tiltak
            </Heading>
            <Paragraph data-size="sm">
              Her kan du som jobber i en offentlig virksomhet dele hvordan dere utforsker eller
              bruker KI. Tiltaket kan være en tidlig utprøving, et pågående prosjekt eller en løsning
              dere bruker.
            </Paragraph>
            <Paragraph data-size="sm">
              Beskriv tiltaket kort og i klarspråk. Vi går gjennom informasjonen før vi publiserer,
              og tar kontakt om vi lurer på noe.
            </Paragraph>
          </Dialog.Block>

          <Dialog.Block className="tiltak-registrer-kropp">
            <form
              id="tiltak-registrer-skjema"
              onSubmit={handleSubmit}
              noValidate
              className="tiltak-skjema"
            >
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
                  description="Ni siffer, som i Brønnøysundregistrene."
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
                <Textfield
                  id={fieldId('kontaktinfo')}
                  type="email"
                  label={labelWithBadge('Kontaktinfo', true)}
                  description="En e-postadresse folk kan bruke for å kontakte virksomheten din om tiltaket. Helst en adresse med flere mottakere, for eksempel postmottak."
                  value={form.kontaktinfo}
                  error={message('kontaktinfo')}
                  onChange={(event) => update('kontaktinfo')(event.target.value)}
                />
              </div>

              <div className="tiltak-seksjon">
                <Fieldset className="tiltak-status-felt">
                  <Fieldset.Legend>{labelWithBadge('Status', true)}</Fieldset.Legend>
                  {STATUSES.map((status, index) => (
                    <Radio
                      key={status}
                      // Bare den første radioknappen får ankeret, slik at lenken
                      // i feiloppsummeringen lander på et fokuserbart element.
                      id={index === 0 ? fieldId('status') : undefined}
                      name="tiltak-status"
                      label={status}
                      value={status}
                      checked={form.status === status}
                      onChange={(event) => update('status')(event.target.value)}
                    />
                  ))}
                  {message('status') !== undefined && (
                    <ValidationMessage>{message('status')}</ValidationMessage>
                  )}
                </Fieldset>

                <div className="tiltak-rad">
                  <Textfield
                    label={labelWithBadge('Oppstartsdato', false)}
                    type="date"
                    value={form.oppstart}
                    onChange={(event) => update('oppstart')(event.target.value)}
                  />
                  <Textfield
                    id={fieldId('slutt')}
                    label={labelWithBadge('Sluttdato', false)}
                    type="date"
                    value={form.slutt}
                    error={message('slutt')}
                    onChange={(event) => update('slutt')(event.target.value)}
                  />
                </div>
              </div>

              {sendFailed && (
                <Alert data-color="danger" className="tiltak-sendefeil">
                  <Heading level={3} data-size="xs">
                    Vi klarte ikke å sende inn tiltaket
                  </Heading>
                  <Paragraph data-size="sm">
                    Prøv igjen om litt. Fortsetter det, send tiltaket til{' '}
                    <a href="mailto:ki-tiltak@kin.norge.no">ki-tiltak@kin.norge.no</a> i stedet, så
                    legger vi det inn manuelt.
                  </Paragraph>
                </Alert>
              )}

              {/*
                Nederst i skjemaet, rett over knappene, ikke øverst.
                Designsystemet anbefaler «å vise error summary like over
                Neste/Send inn-knappen», slik at brukeren ser sammenhengen
                mellom feilen og hvorfor hun ikke kommer videre. Toppen
                anbefales bare når siden lastes på nytt ved innsending, når
                brukeren kommer tilbake til et påbegynt skjema, eller når
                løsningen slipper deg videre med feil. Ingen av delene gjelder
                her.

                Fokus flyttes hit ved mislykket innsending uansett plassering,
                se key={attempt} over.
              */}
              {errors.length > 0 && (
                <ErrorSummary key={attempt} className="tiltak-feiloppsummering">
                  <ErrorSummary.Heading>Før du kan gå videre må du gjøre dette:</ErrorSummary.Heading>
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
            </form>
          </Dialog.Block>

          <Dialog.Block className="tiltak-registrer-fot">
            <Button
              type="submit"
              form="tiltak-registrer-skjema"
              className="tiltak-registrer-submit"
              loading={sending}
              disabled={sending}
            >
              {sending ? 'Sender…' : 'Del tiltak'}
            </Button>
            {/*
              command/commandfor i stedet for onClick={onClose}, samme begrunnelse som i
              KiTiltakFilterPanel.tsx og KiTiltakDetail.tsx. Å lukke via open-prop setter
              dialog.open direkte og hopper over close()-algoritmen, som låser resten av
              siden bak en usynlig backdrop og hindrer onClose-eventet i å fyre.
            */}
            <Button variant="tertiary" command="close" commandfor={REGISTER_DIALOG_ID}>
              Avbryt
            </Button>
          </Dialog.Block>
        </>
      )}
    </Dialog>
  );
}
