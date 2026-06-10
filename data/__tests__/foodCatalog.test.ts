import { describe, expect, it } from 'vitest';

import {
  findBestCatalogMatch,
  FOOD_CATALOG,
  searchCatalog,
} from '@/data/foodCatalog';

describe('food catalog', () => {
  it('ships the planned 200-300 localized entries', () => {
    expect(FOOD_CATALOG.length).toBeGreaterThanOrEqual(200);
    expect(FOOD_CATALOG.length).toBeLessThanOrEqual(300);
  });

  it('matches Chinese aliases', () => {
    expect(findBestCatalogMatch('西红柿')?.nameZh).toContain('番茄');
    expect(findBestCatalogMatch('鸡胸')?.nameZh).toContain('鸡胸肉');
  });

  it('returns useful fuzzy search results', () => {
    expect(searchCatalog('酸奶').some((food) => food.nameZh.includes('酸奶'))).toBe(true);
  });
});
