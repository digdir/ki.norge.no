# Digital events

Live stream, interaction and recordings on event pages, and the Video module for articles. Issue [#926](https://github.com/digdir/ki.norge.no/issues/926).

## What the editor sees

Kalenderhendelse has a tab "Digitalt arrangement". All fields are optional, so physical events are unaffected.

| Alias | Label | Type |
|---|---|---|
| `direktesendingUrl` | Direktesending | Lenke / URL |
| `interaksjonUrl` | Interaksjon | Lenke / URL |
| `direktesendingStart` | Vis sendingen fra | Date Picker with time |
| `direktesendingSlutt` | Fjern sendingen etter | Date Picker with time |
| `opptakUrl` | Opptak | Lenke / URL |
| `opptakSynstolketUrl` | Synstolket opptak | Lenke / URL |

The element type `artikkelVideo` ("Video") has `tittel` (mandatory), `videoUrl` (mandatory, Lenke / URL) and `synstolketUrl`. It is allowed in "Block List - Artikkel Innhold" and "Block List - Eksempel Innhold".

## How the page behaves

- From `direktesendingStart` to `direktesendingSlutt` the stream sits at the top of the event page, with the interaction to the right. Below 1025px they are stacked.
- Empty start means midnight on the start date. Empty end means midnight after the end date (or the start date).
- Before the window the page says the stream will appear there.
- After the window the stream and the interaction are gone, and `opptakUrl` is shown under the heading "Opptak" in the main content. The recording is never shown while the stream is on the page.

## Accepted links

The editor pastes a share link, never iframe code. `lib/video-embed.ts` accepts only these, and builds the embed URL itself from a validated ID. Anything else shows nothing.

- Vimeo video: `vimeo.com/<id>`, `vimeo.com/<id>/<hash>`, `player.vimeo.com/video/<id>`
- Vimeo live event: `vimeo.com/event/<id>`
- YouTube: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/live/`, `/embed/`, `/shorts/`. Embedded from `youtube-nocookie.com`.
- Slido: `app.sli.do/event/...`, `wall.sli.do/event/...`
- Vimeo chat: `vimeo.com/event/<id>/chat`, `vimeo.com/live-chat/<id>`

A new provider needs both a parser in `video-embed.ts` and the host in `frame-src` in `lib/csp.ts`.

## Time and cache

- Umbraco date pickers return wall time without an offset. `parseOsloDateTime` reads it as Norwegian time, with the EU summer time rule computed by hand. `new Date()` on the Worker would place it one or two hours late.
- Pages are cached at the edge for 10 minutes (`CACHE_MAX_AGE` in `middleware.ts`). So the server renders the stream hidden from 15 minutes before start (`FORHAANDSVISNING_MS`), and a client script in `DirektesendingHero.astro` reveals it at start and removes it at the end. It also handles a page that has been open for a while.
- Without JavaScript the stream appears at most 10 minutes late and disappears at most 10 minutes late.
- The script uses the viewer's clock. Ask editors to set the end with some margin, so a stream that runs over is not cut.

## Accessibility

- Each iframe has a title. Next to each embed there is a link to the provider's own page, and for Slido a link that opens it in a new tab, because the Slido iframe is weak with a screen reader.
- Captions (WCAG 1.2.2) are set in Vimeo or YouTube. Live captions (1.2.4) must be bought or arranged by communications. The code cannot solve it.
- Audio description (1.2.5) is the separate link `opptakSynstolketUrl` or `synstolketUrl`.
- Vimeo is embedded with `dnt=1` and YouTube from `youtube-nocookie.com`. Slido sets its own cookies. The cookie notice and the privacy statement must be checked before the first event.

## Getting the schema to prod

`USYNC_OWNS_SCHEMA=true` in prod and tt02, so `ContentTypeComposer` does not create these fields there. Locally and in CI it does. Adding a type or a property does not re-key anything, so `SchemaRekeyGuard` does not react. Read `apps/cms-umbraco/uSync/README.md` first.

1. Deploy the frontend. It tolerates missing fields, so the order does not matter.
2. In prod backoffice, Settings, create the element type `artikkelVideo` with the fields above.
3. Add `artikkelVideo` to "Block List - Artikkel Innhold" and "Block List - Eksempel Innhold". Label `{umbValue: tittel | fallback:Video}`.
4. On Kalenderhendelse, add the tab "Digitalt arrangement" (alias `digitalt`) between Innhold and Innstillinger, with the six fields above. The aliases must match exactly.
5. Settings, uSync, Export in prod. Take the files from the pod and commit them. Never export from tt02 or a local machine.
6. Do the same in tt02 by hand, or wait for the commit from step 5 and deploy the CMS there.

Written 2026-11-09 for [#926](https://github.com/digdir/ki.norge.no/issues/926).
