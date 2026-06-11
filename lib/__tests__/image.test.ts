import { describe, expect, it } from 'vitest';

import { fitWithin } from '@/lib/imageDimensions';

describe('image resize dimensions', () => {
  it('preserves landscape and portrait aspect ratios with explicit dimensions', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('does not upscale small images', () => {
    expect(fitWithin(300, 200, 360)).toBeNull();
  });

  it('defers resizing when picker dimensions are missing', () => {
    expect(fitWithin(0, 0, 1600)).toBeNull();
    expect(fitWithin(Number.NaN, 800, 1600)).toBeNull();
  });
});
