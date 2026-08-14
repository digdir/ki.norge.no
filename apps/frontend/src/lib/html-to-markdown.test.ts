import { describe, expect, test } from 'vitest';
import { htmlToMarkdown, prefersMarkdown } from './html-to-markdown';

const BASE = 'https://ki.norge.no';

function page(mainHtml: string, head = ''): string {
  return `<!doctype html><html lang="nb"><head><title>Tittel | KI Norge</title>${head}</head>
    <body><header>Meny</header><main id="main-content">${mainHtml}</main><footer>Bunn</footer></body></html>`;
}

function bodyOf(html: string): string {
  const result = htmlToMarkdown(html, BASE);
  if (!result) throw new Error('forventet markdown');
  return result.markdown.split('\n---\n')[1]?.trim() ?? result.markdown;
}

describe('prefersMarkdown', () => {
  test.each([
    ['text/markdown', true],
    ['text/x-markdown', true],
    ['text/markdown;q=0.9, text/html;q=0.8', true],
    ['text/markdown, text/html', true],
  ])('%s gir markdown', (header, expected) => {
    expect(prefersMarkdown(header)).toBe(expected);
  });

  test.each([
    [null],
    [''],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'],
    ['*/*'],
    ['application/json'],
    ['text/markdown;q=0'],
    ['text/markdown;q=0.5, text/html;q=0.9'],
  ])('%s gir ikke markdown', (header) => {
    expect(prefersMarkdown(header as string | null)).toBe(false);
  });
});

describe('htmlToMarkdown', () => {
  test('tar bare med innholdet i main', () => {
    const md = bodyOf(page('<p>Innhold</p>'));
    expect(md).toContain('Innhold');
    expect(md).not.toContain('Meny');
    expect(md).not.toContain('Bunn');
  });

  test('gir null når siden ikke har hovedinnhold', () => {
    expect(htmlToMarkdown('<html><body><p>Uten main</p></body></html>', BASE)).toBeNull();
    expect(htmlToMarkdown(page(''), BASE)).toBeNull();
  });

  test('header inneholder tittel fra h1, kanonisk URL og beskrivelse', () => {
    const html = page(
      '<h1>Slik kommer du i gang</h1><p>Tekst</p>',
      '<link rel="canonical" href="https://ki.norge.no/veiledning"><meta name="description" content="En beskrivelse">',
    );
    const result = htmlToMarkdown(html, BASE)!;
    expect(result.title).toBe('Slik kommer du i gang');
    expect(result.markdown.startsWith('---\n')).toBe(true);
    expect(result.markdown).toContain('title: "Slik kommer du i gang"');
    expect(result.markdown).toContain('url: "https://ki.norge.no/veiledning"');
    expect(result.markdown).toContain('description: "En beskrivelse"');
  });

  test('faller tilbake på title-taggen uten site-suffiks når h1 mangler', () => {
    expect(htmlToMarkdown(page('<p>Tekst</p>'), BASE)!.title).toBe('Tittel');
  });

  test('overskriftsnivå bevares', () => {
    const md = bodyOf(page('<h1>En</h1><h2>To</h2><h3>Tre</h3>'));
    expect(md).toContain('# En');
    expect(md).toContain('## To');
    expect(md).toContain('### Tre');
  });

  test('relative lenker og bilder gjøres absolutte', () => {
    const md = bodyOf(page('<p><a href="/veiledning">Les</a></p><p><img src="/bilde.png" alt="Alt"></p>'));
    expect(md).toContain('[Les](https://ki.norge.no/veiledning)');
    expect(md).toContain('![Alt](https://ki.norge.no/bilde.png)');
  });

  test('anker, mailto og absolutte lenker står urørt', () => {
    const md = bodyOf(page('<p><a href="#topp">T</a> <a href="mailto:a@b.no">E</a> <a href="https://x.no/y">X</a></p>'));
    expect(md).toContain('[T](#topp)');
    expect(md).toContain('[E](mailto:a@b.no)');
    expect(md).toContain('[X](https://x.no/y)');
  });

  test('utheving, kode og linjeskift', () => {
    const md = bodyOf(page('<p><strong>Fet</strong> og <em>kursiv</em> og <code>kode</code></p>'));
    expect(md).toContain('**Fet**');
    expect(md).toContain('*kursiv*');
    expect(md).toContain('`kode`');
  });

  test('linjeskift inni utheving spises ikke av markørene', () => {
    // Redaktørmønster fra RTE: <strong>Tittel<br><br></strong>Tekst
    const md = bodyOf(page('<p><strong>Mandag<br><br></strong>Klokken 13</p>'));
    expect(md).toContain('**Mandag**');
    expect(md).not.toContain('**Mandag**Klokken');
    expect(md.indexOf('Klokken 13')).toBeGreaterThan(md.indexOf('**Mandag**'));
  });

  test('bilde uten alt-tekst regnes som dekorativt og utelates', () => {
    const md = bodyOf(page('<p>Tekst</p><p><img src="/pynt.svg" alt=""></p>'));
    expect(md).toBe('Tekst');
  });

  test('listepunkt med lenke og beskrivelse holder dem fra hverandre', () => {
    const md = bodyOf(page('<ul><li><a href="/a">Tittel</a><p>Beskrivelse</p></li></ul>'));
    expect(md).not.toContain(')Beskrivelse');
    expect(md).toContain('- [Tittel](https://ki.norge.no/a)');
    expect(md).toContain('  Beskrivelse');
  });

  test('punktliste og nummerert liste', () => {
    const md = bodyOf(page('<ul><li>En</li><li>To</li></ul><ol><li>Først</li><li>Så</li></ol>'));
    expect(md).toContain('- En\n- To');
    expect(md).toContain('1. Først\n2. Så');
  });

  test('nøstet liste rykkes inn', () => {
    const md = bodyOf(page('<ul><li>Ytre<ul><li>Indre</li></ul></li></ul>'));
    expect(md).toContain('- Ytre');
    expect(md).toContain('  - Indre');
  });

  test('sitat prefikses per linje', () => {
    const md = bodyOf(page('<blockquote><p>Første</p><p>Andre</p></blockquote>'));
    expect(md).toContain('> Første');
    expect(md).toContain('> Andre');
  });

  test('tabell får skillelinje og escaper rørtegn', () => {
    const md = bodyOf(page('<table><tr><th>A|B</th><th>C</th></tr><tr><td>1</td><td>2</td></tr></table>'));
    expect(md).toContain('| A\\|B | C |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  test('kodeblokk beholder linjeskift', () => {
    const md = bodyOf(page('<pre><code>linje1\nlinje2</code></pre>'));
    expect(md).toContain('```\nlinje1\nlinje2\n```');
  });

  test('script, style og aria-hidden utelates', () => {
    const md = bodyOf(
      page('<p>Synlig</p><script>var x = "hemmelig"</script><style>.a{color:red}</style><p aria-hidden="true">Skjult</p>'),
    );
    expect(md).toContain('Synlig');
    expect(md).not.toContain('hemmelig');
    expect(md).not.toContain('color:red');
    expect(md).not.toContain('Skjult');
  });

  test('markdown-tegn i brødtekst escapes', () => {
    const md = bodyOf(page('<p>Bruk _understrek_ og *stjerne* og [klamme]</p>'));
    expect(md).toContain('\\_understrek\\_');
    expect(md).toContain('\\*stjerne\\*');
    expect(md).toContain('\\[klamme\\]');
  });

  test('figur med bildetekst blir bilde pluss kursiv tekst', () => {
    const md = bodyOf(page('<figure><img src="/a.png" alt="Kart"><figcaption>Kilde: SSB</figcaption></figure>'));
    expect(md).toContain('![Kart](https://ki.norge.no/a.png)');
    expect(md).toContain('*Kilde: SSB*');
  });

  test('avsnitt skilles med tom linje og trippel-linjeskift kollapses', () => {
    const md = bodyOf(page('<div><p>En</p></div><div><div><p>To</p></div></div>'));
    expect(md).toBe('En\n\nTo');
  });

  test('anonymt div-innhold rundt inline-elementer havner i samme avsnitt', () => {
    const md = bodyOf(page('<div>Se <a href="/x">her</a> for mer</div>'));
    expect(md).toBe('Se [her](https://ki.norge.no/x) for mer');
  });
});
