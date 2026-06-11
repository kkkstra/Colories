import { describe, expect, it } from 'vitest';

import {
  findBestCatalogMatch,
  FOOD_CATALOG,
  searchCatalog,
} from '@/data/foodCatalog';

describe('food catalog', () => {
  it('ships an expanded localized food library', () => {
    expect(FOOD_CATALOG.length).toBeGreaterThanOrEqual(600);
    expect(FOOD_CATALOG.length).toBeLessThanOrEqual(750);
  });

  it('keeps source references on every preset item', () => {
    expect(FOOD_CATALOG.every((food) => food.sourceReference.length > 20)).toBe(true);
    expect(
      FOOD_CATALOG.every((food) =>
        /USDA|香港食安中心|中国疾控|营养标签/.test(food.sourceReference),
      ),
    ).toBe(true);
  });

  it('matches Chinese aliases', () => {
    expect(findBestCatalogMatch('西红柿')?.nameZh).toContain('番茄');
    expect(findBestCatalogMatch('鸡胸')?.nameZh).toContain('鸡胸肉');
  });

  it('returns useful fuzzy search results', () => {
    expect(searchCatalog('酸奶').some((food) => food.nameZh.includes('酸奶'))).toBe(true);
  });
});
