import { expect, test } from 'vitest';
import { FIRST_PAGE, NEXT_PAGE } from './paging';

test.each([1, 2, 3, 4])('første side og hver «Last flere» ender på en hel rad med %i kolonner', (columns) => {
  for (let clicks = 0; clicks <= 10; clicks++) {
    expect((FIRST_PAGE + clicks * NEXT_PAGE) % columns).toBe(0);
  }
});
