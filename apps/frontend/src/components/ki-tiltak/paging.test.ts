import { expect, test } from 'vitest';
import { PAGE_SIZE } from './paging';

test.each([1, 2, 3])('a full page ends on a full row with %i columns', (columns) => {
  expect(PAGE_SIZE % columns).toBe(0);
});
