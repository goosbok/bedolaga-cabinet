import { describe, expect, it } from 'vitest';
import { getVisibleBlocks, isBlockVisible } from './visibility';
import type { GetLocalizedText, RenderBlock } from './types';

const getText: GetLocalizedText = (t) => t?.en ?? '';

const block = (over: Partial<RenderBlock> = {}) => ({ title: {}, description: {}, ...over });

describe('isBlockVisible', () => {
  it('is visible when it has a title', () => {
    expect(isBlockVisible(block({ title: { en: 'Install' } }), getText)).toBe(true);
  });

  it('is visible when it has only a description', () => {
    expect(isBlockVisible(block({ description: { en: 'Do this' } }), getText)).toBe(true);
  });

  it('is visible when it has only buttons', () => {
    expect(isBlockVisible(block({ buttons: [{ text: {} }] }), getText)).toBe(true);
  });

  it('is visible when it has only a custom node', () => {
    expect(isBlockVisible(block({ customNode: 'widget' }), getText)).toBe(true);
  });

  it('is hidden when it is entirely empty', () => {
    expect(isBlockVisible(block(), getText)).toBe(false);
  });

  it('is hidden when it has an empty buttons array', () => {
    expect(isBlockVisible(block({ buttons: [] }), getText)).toBe(false);
  });

  // The panel's admin form saves a cleared field as '' rather than dropping the
  // key, so "field present" and "field has text" are genuinely different cases.
  it('is hidden when its text fields resolve to empty strings', () => {
    expect(isBlockVisible(block({ title: { en: '' }, description: { en: '' } }), getText)).toBe(
      false,
    );
  });
});

describe('getVisibleBlocks', () => {
  it('drops invisible blocks and preserves order', () => {
    const first = block({ title: { en: 'First' } });
    const hidden = block();
    const last = block({ description: { en: 'Last' } });

    expect(getVisibleBlocks([first, hidden, last], getText)).toEqual([first, last]);
  });

  it('returns an empty list when nothing is visible', () => {
    expect(getVisibleBlocks([block(), block({ title: { en: '' } })], getText)).toEqual([]);
  });
});
