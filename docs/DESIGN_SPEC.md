# KI Norge Portal - Design Specification

## Overview

**KI Norge** (ki.norge.no) is a Norwegian government portal for artificial intelligence in the public sector. It serves as a hub for guidance, regulatory sandbox information, and best practice examples for implementing AI responsibly in government services.

**Language:** Norwegian (Bokmål)
**Domain:** ki.norge.no (subdomain of norge.no)

---

## Purpose & Goals

1. **Educate** - Provide guidance on responsible AI use in public sector
2. **Showcase** - Share successful AI implementations and case studies
3. **Facilitate** - Connect organizations with the regulatory sandbox program
4. **Support** - Offer resources for different roles (leaders, developers, agencies)

---

## Target Audiences

| Audience | Needs |
|----------|-------|
| **Public agencies** | Guidance on regulations, implementation strategies, compliance |
| **Developers** | Technical documentation, APIs, integration patterns |
| **Leaders/Decision makers** | Strategic overviews, risk assessment, ROI examples |

---

## Design System

Uses **Designsystemet** - the official Norwegian government design system.

### Colors

| Token | Usage |
|-------|-------|
| `--ds-color-accent-*` | Primary actions, links, highlights (blue) |
| `--ds-color-neutral-*` | Text, borders, backgrounds (grays) |
| `--ds-color-success-*` | Positive indicators, checkmarks (green) |
| `--ds-color-warning-*` | Alerts, important notices (yellow/orange) |
| `--ds-color-danger-*` | Errors, critical warnings (red) |

**Background layers:**
- `background-default` - Page background (lightest)
- `surface-default` - Card/component backgrounds
- `surface-hover` - Interactive hover states

### Typography

| Element | Size Token | Weight |
|---------|------------|--------|
| Hero title | `2xlarge` | Bold |
| Page title (H1) | `2xlarge` | Bold |
| Section title (H2) | `large` | Semibold |
| Card title (H3) | `medium` / `small` | Medium |
| Body text | `medium` | Regular |
| Small text / metadata | `small` / `xsmall` | Regular |

**Font family:** System font stack (native Norwegian government typography)

### Spacing Scale

Uses `--ds-size-*` tokens (1-12):
- `size-2` (8px) - Tight spacing
- `size-4` (16px) - Standard component padding
- `size-6` (24px) - Section gaps
- `size-8` (32px) - Page padding
- `size-10` (40px) - Large section spacing
- `size-12` (48px) - Hero/major sections

### Border & Shadow

- `--ds-border-radius-md` - Cards, buttons
- `--ds-border-radius-lg` - Large containers
- `--ds-shadow-sm` - Subtle card elevation
- `--ds-shadow-md` - Hover states

---

## Page Structure

### Information Architecture

```
ki.norge.no/
├── / (Homepage)
├── /veiledning (Guidance hub)
│   └── /veiledning/[slug] (Individual guides)
├── /sandkasse (Regulatory sandbox)
│   └── /sandkasse/prosjekter (Sandbox projects)
├── /eksempler (Case studies)
│   ├── /eksempler/[slug] (Individual cases)
│   └── /eksempler/send-inn (Submit form)
├── /artikler (News/articles)
│   └── /artikler/[slug] (Individual articles)
├── /faq (FAQ)
├── /om-oss (About)
└── /kontakt (Contact)
```

---

## Page Layouts

### Homepage

**Sections (top to bottom):**

1. **Hero**
   - Large gradient background (accent → neutral)
   - Centered headline: "Kunstig intelligens i offentlig sektor"
   - Subheadline explaining the portal purpose
   - Two CTA buttons: "Utforsk veiledning" (primary), "Se eksempler" (secondary)

2. **Three Pillars**
   - Equal-width cards (3 columns)
   - Each with: circular icon, title, description, link
   - Pillars: Veiledning, Sandkasse, Eksempler
   - Hover: lift effect with shadow

3. **Resources Section**
   - Header: "Populære ressurser" with "Se alle" link
   - Horizontal card grid (auto-fit, min 250px)
   - Cards show: type label, title, description

4. **Target Audiences**
   - 3 cards for each audience type
   - Each with: title, description, bullet list of features, CTA link
   - Icons or illustrations for each audience

5. **News/Articles**
   - Header: "Siste nytt" with "Se alle artikler" link
   - 3-column grid of article cards
   - Cards show: category tag, title, excerpt, date

### Content Pages (Articles, Guides, Cases)

**Layout:**
- Max-width: 800px centered
- Page header with title
- Rich content area (blocks from CMS)
- Metadata sidebar or footer (date, author, category)
- Back navigation

### Listing Pages

**Layout:**
- Max-width: 680px
- Page title and description
- Filter/category options (optional)
- Card grid (auto-fit, responsive)
- Pagination if needed

---

## Components

### Navigation Header
- Sticky positioning
- Logo (left): "KI Norge" linking to homepage
- Navigation links (right): Veiledning, Sandkasse, Eksempler, Artikler, Om oss, Kontakt
- Active state: underline or accent color
- Mobile: hamburger menu (collapsible)

### Footer
- Dark or neutral background
- 4 columns:
  1. About KI Norge (brief)
  2. Partners (Nkom, Datatilsynet, Digdir logos/links)
  3. Quick links (FAQ, Contact)
  4. Legal (Privacy, Accessibility statement)
- Copyright at bottom

### Article Card
- Border: subtle neutral
- Padding: size-5
- Content: category tag (accent), title (H3), excerpt, date
- Hover: border → accent, shadow, slight lift

### Pillar Card
- Centered content
- Icon in circular accent background
- Title (H3)
- Description paragraph
- "Les mer →" link
- Hover: transform translateY(-4px), shadow

### Alert/Notice Box
- Types: info (blue), warning (yellow), important (orange), success (green)
- Icon + title + content
- Rounded corners, left border accent

### FAQ Accordion
- Uses `<details>` / `<summary>` pattern
- Question as summary (clickable)
- Answer expands below
- Grouped by category

---

## Responsive Behavior

**Breakpoint:** 768px

| Element | Desktop | Mobile |
|---------|---------|--------|
| Navigation | Horizontal links | Hamburger menu |
| Hero | Large text, side-by-side buttons | Stacked buttons | 4 columns | 2 columns |
| Pillars | 3 columns | 1 column (stacked) |
| Article grid | 3 columns | 1 column |
| Footer | 4 columns | Stacked |

---

## Interactions

| Element | Hover | Active | Focus |
|---------|-------|--------|-------|
| Buttons | Darken background | Press effect | Outline ring |
| Cards | Border accent, shadow, lift | - | Outline ring |
| Links | Underline, accent color | Darker accent | Outline ring |
| Nav items | Underline | Accent background | Outline ring |

---

## Content Blocks (CMS)

Rich content supports these block types:

- **Paragraph** - Standard text
- **Heading** - H2-H6 with size variants
- **List** - Ordered and unordered
- **Link** - Inline and standalone
- **Image** - With caption and alt text
- **Quote** - Blockquote styling
- **Code** - Syntax highlighted blocks
- **Alert** - Info/warning/important boxes
- **FAQ** - Inline Q&A sections
- **Link list** - Grouped resource links

---

## Accessibility

- Skip link to main content
- Semantic HTML (nav, main, article, section)
- ARIA labels where needed
- Color contrast: WCAG AA minimum
- Keyboard navigable
- Focus indicators on all interactive elements
- Alt text for images
- Language attribute: `lang="nb"`

---

## Visual Examples

**Hero section mood:**
- Clean, authoritative, trustworthy
- Government aesthetic (not corporate/flashy)
- Calm blue accent colors
- Plenty of whitespace
- Clear hierarchy

**Card grid mood:**
- Organized, scannable
- Consistent spacing
- Subtle shadows for depth
- Clear call-to-action patterns
