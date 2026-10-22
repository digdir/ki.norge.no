# ADR: Counting link use without consent

- **Status:** decided by the product owner, 2026-10-22
- **Code:** `apps/frontend/src/lib/link-origin.ts`, `apps/cache-kinorgeportal/src/link-counts.ts`
- **Running it:** [link-statistics.md](../link-statistics.md)

This records an interpretation of the law, made by the product owner and written down so it can be explained if it is challenged. It is not a legal opinion. The privacy officer should be told about it, and Nkom is the authority that decides.

## Context

The editorial team wants to know how visitors use the navigation, for example how many reach /om-oss from the main menu compared with the footer.

The site has Siteimprove Analytics. It loads only after a visitor accepts the cookie banner, so it counts some visitors and not others. It also cannot tell two links to the same page apart without extra event code in the browser, which would need the same consent.

The rule that decides whether consent is needed is ekomloven § 3-15 ([lov 13. desember 2024 nr. 76](https://lovdata.no/dokument/NL/lov/2024-12-13-76), in force from 1 January 2025). It is the Norwegian version of article 5(3) of the [ePrivacy Directive](https://eur-lex.europa.eu/eli/dir/2002/58/oj).

- **What it covers.** Storing information in, or gaining access to information in, the user's terminal equipment, without information and consent. It is technology neutral: cookies, local storage and tracking pixels are all covered.
- **The exemptions.** Storage or access solely to transmit a communication, or strictly necessary to deliver a service the user has explicitly asked for. Norway has no exemption for audience measurement.
- **Who decides.** Nkom decides whether a technical solution is covered and whether an exemption applies. Datatilsynet decides whether the information and the consent meet the GDPR. See [Datatilsynet on cookies and other tracking technologies](https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/bruk-av-informasjonskapsler-og-andre-sporingsteknologier/).
- **How broadly it is read.** The European Data Protection Board's [Guidelines 2/2023](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf) (version 2, adopted 7 October 2024) read "gaining access" broadly. Making the browser send information at the site's instruction can be access even when nothing is stored, and the guidelines discuss URL and pixel tracking as cases.

## Decision

Count link use on the server, from the address the browser asks for.

1. **Labels on the links.** Internal links in the main menu, the mobile menu, the logo and the footer carry a fixed label, for example `/om-oss?fra=meny`. The label is written into the HTML on the server and is the same for every visitor.
2. **The cache worker counts.** The worker in front of the site reads the label, removes it from the address before the cache and the frontend see it, and adds 1 to a counter for the day in Norwegian time, the label and the destination page. The counter is a D1 table, `link_counts`.
3. **Nothing else is stored.** No IP address, no user agent, no time of day, no identifier, no referrer, no cookie and no local storage. The user agent is used only at the moment of counting, to skip crawlers.
4. **Only real use is counted.** Page loads a person started, not prefetches, not crawlers, only labels on the list, and only pages that exist.
5. **The address bar is cleaned.** A small script removes the label after the page has loaded, so a copied or bookmarked address is clean. It reads the page's own address and sends nothing.

## Why this needs no consent

Three questions decide it.

1. **Is anything stored in the user's terminal?** No. Nothing is written to cookies, local storage or anywhere else in the browser.
2. **Do we gain access to information in the terminal?** No. We use only the address the browser asks for, which any server must receive to deliver a page. That is the communication itself. The label adds nothing about the user or the device. It splits one address into a few, so the server learns "/om-oss, from the menu" instead of "/om-oss". No script reads anything from the device and sends it.
3. **Is it personal data?** No. A count per day, label and page cannot be linked to a person, and anonymous information is outside the GDPR ([recital 26](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Cloudflare already processes the IP address to deliver every request. The counter does not add a new use of it.

The line we draw is not whether we learn which link was used, but whether we can tell that two uses came from the same person. This design cannot.

## The strongest objection

The guidelines treat a parameter placed in a link and sent back by the device as a possible case of gaining access. On that reading, `?fra=meny` is information we put in the page that the browser sends back.

Our answer is that the guidelines are aimed at parameters that identify or single out the user, such as a unique ID in a link, so the sender can recognise them later. A fixed label, the same for everyone, cannot tell two visitors apart. If a parameter in a link were access in itself, every link with a query string on the web would need consent.

The remaining risk is that Nkom reads § 3-15 more strictly than we do.

## Alternatives that were rejected

- **A click beacon without consent.** A script reads which link was clicked and sends it. That is the kind of access the guidelines describe, so it would need consent.
- **Events in Siteimprove or another tool, with consent.** Legally clear, but only visitors who accept are counted. This stays the fallback.
- **A label after `#`.** The browser never sends the part after `#` to the server, so it would need a script to report it, which is the beacon again.
- **Cloudflare Web Analytics.** Cookieless, but it counts pages, not which link was used, and it is a script in the browser.
- **The Referer header.** It says which page the visitor came from, not which link on it.
- **A redirect that removes the label.** Not needed. The cache worker removes the label inside the request, so there is no extra round trip.

## If it is challenged

- **Stop counting:** remove the D1 binding from the cache worker and deploy. The labels are still removed from the address, so nothing else changes. Delete the table if the counts should go too.
- **Count only with consent:** the consent choice is in local storage, which the server cannot see. The labels would then be added in the browser, only for visitors who accepted, which puts the counting under the same consent as Siteimprove.

Both are small changes in one place.

## Consequences

- **What the numbers mean.** Two clicks by the same person count as two. That is by design, since we cannot tell them apart. Some crawlers will slip past the filter.
- **Where labels are missing.** Only the menu, the mobile menu, the logo and the footer are labelled. Other links, such as the search results and the KI-tiltak cards, are not counted until their component calls `withOrigin()`.
- **The list of labels is in two places,** the frontend and the cache worker. A test in the cache worker fails if they differ.
- **The privacy notice should mention it,** for openness even though no personal data is processed. Suggested text, in Nynorsk like the rest of the notice:

  > Vi tel kor ofte lenkjene i menyen og i botnen av sida blir brukte. Vi lagrar berre talet per dag, kva del av sida lenkja var i og kva side ho gjekk til. Vi brukar ikkje informasjonskapslar til dette, og vi lagrar ikkje IP-adressa di eller anna som kan identifisere deg.
