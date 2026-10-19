import { expect, test } from 'vitest';
import { FIRST_PAGE, NEXT_PAGE } from './paging';

test.each([1, 2, 3, 4])('first page and each "Last flere" end on a full row with %i columns', (columns) => {
  for (let clicks = 0; clicks <= 10; clicks++) {
    expect((FIRST_PAGE + clicks * NEXT_PAGE) % columns).toBe(0);
  }
});
