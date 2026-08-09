import { describe, expect, it } from 'vitest';
import { isBlockVisible } from './visibility';
import type { RenderBlock } from './types';

const getText = (t: { en?: string } | undefined) => t?.en ?? '';

const block = (over: Partial<RenderBlock> = {}) =>
  ({ title: {}, description: {}, ...over }) as RenderBlock;

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
});
