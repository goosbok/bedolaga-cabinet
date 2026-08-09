import type { GetLocalizedText, RenderBlock } from './types';

/**
 * Whether an installation block is worth rendering. Shared by all four block
 * renderers and by anchor assignment, so onboarding anchors are computed
 * against exactly the list the user sees.
 */
export function isBlockVisible(block: RenderBlock, getLocalizedText: GetLocalizedText): boolean {
  return Boolean(
    getLocalizedText(block.title) ||
    getLocalizedText(block.description) ||
    block.buttons?.length ||
    block.customNode,
  );
}

/**
 * The blocks a renderer actually puts on screen, in render order. Every renderer
 * and anchor assignment goes through this one producer, so the visible list is
 * shared by construction rather than by four files agreeing to filter alike.
 */
export const getVisibleBlocks = (blocks: RenderBlock[], getLocalizedText: GetLocalizedText) =>
  blocks.filter((b) => isBlockVisible(b, getLocalizedText));
