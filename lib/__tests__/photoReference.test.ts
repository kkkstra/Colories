import { describe, expect, it } from 'vitest';

import {
  createMealPhotoReference,
  extractMealPhotoReference,
  joinDocumentPhotoUri,
  normalizeMealPhotoReference,
  normalizeMealPhotoReferences,
} from '@/lib/photoReference';

describe('meal photo references', () => {
  it('stores new meal photos as stable relative references', () => {
    expect(createMealPhotoReference('meal-abc.jpg')).toBe('meal-photos/meal-abc.jpg');
  });

  it('normalizes old iOS absolute document paths after app upgrades', () => {
    const oldUri =
      'file:///var/mobile/Containers/Data/Application/OLD/Documents/meal-photos/meal-abc.jpg';

    expect(extractMealPhotoReference(oldUri)).toBe('meal-photos/meal-abc.jpg');
    expect(normalizeMealPhotoReference(oldUri)).toBe('meal-photos/meal-abc.jpg');
  });

  it('resolves references against the current document directory', () => {
    expect(joinDocumentPhotoUri('file:///current/Documents/', 'meal-photos/meal-abc.jpg')).toBe(
      'file:///current/Documents/meal-photos/meal-abc.jpg',
    );
  });

  it('normalizes and deduplicates multiple meal photos', () => {
    expect(
      normalizeMealPhotoReferences([
        'file:///old/Documents/meal-photos/a.jpg',
        'meal-photos/a.jpg',
        'meal-photos/b.jpg',
      ]),
    ).toEqual(['meal-photos/a.jpg', 'meal-photos/b.jpg']);
  });
});
