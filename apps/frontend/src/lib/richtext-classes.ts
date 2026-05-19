/**
 * Tag bare HTML elements from Umbraco RichText with designsystemet classes.
 *
 * Editors can't set classes in Tiptap, so we attach them server-side.
 * `applyDsClasses` runs once per RichText field (called from richTextToHtml's
 * root branch in umbraco.ts).
 *
 * To add or remove a transformation, edit the map below. Each line is
 * `'<css selector>': '<class to add>'`. Idempotent — duplicates are skipped.
 */

import { parseHTML } from 'linkedom';

const DS_CLASS_MAP: Record<string, string> = {
  'ul, ol':                  'ds-list',
  // 'a':                    'ds-link',
  // 'table':                'ds-table',
  // 'h1, h2, h3, h4, h5, h6': 'ds-heading',
  // 'hr':                   'ds-divider',
  // 'details':              'ds-details',
};

export function applyDsClasses(html: string): string {
  if (!html) return '';
  const { document } = parseHTML(`<template>${html}</template>`);
  const root = document.querySelector('template')!;

  for (const [selector, className] of Object.entries(DS_CLASS_MAP)) {
    for (const el of root.querySelectorAll(selector)) {
      el.classList.add(className);
    }
  }

  return root.innerHTML;
}
