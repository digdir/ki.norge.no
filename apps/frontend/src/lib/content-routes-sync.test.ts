import { describe, expect, test } from 'vitest';
import shared from '../../../../shared/content-routes.json';
import cmsMirror from '../../../../apps/cms-umbraco/content-routes.json';

// CMS Docker build context er apps/cms-umbraco/ alene, så shared/-fila kan ikke
// nås derfra ved build. Vi speiler derfor route-mappingen inn i CMS-prosjektet.
// Denne testen sørger for at speilingen ikke divergerer.
//
// Hvis testen feiler: kopier shared/content-routes.json sitt "routes"-objekt til
// apps/cms-umbraco/content-routes.json (eller motsatt).

describe('content-routes: shared og CMS-mirror er i synk', () => {
  test('routes-objektet er identisk', () => {
    expect(cmsMirror.routes).toEqual(shared.routes);
  });

  test('alle typer i shared finnes i mirror', () => {
    for (const type of Object.keys(shared.routes)) {
      expect(cmsMirror.routes).toHaveProperty(type);
    }
  });

  test('mirror introduserer ikke ekstra typer', () => {
    for (const type of Object.keys(cmsMirror.routes)) {
      expect(shared.routes).toHaveProperty(type);
    }
  });
});
