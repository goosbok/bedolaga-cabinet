import type { LocalizedText } from '@/types';
import type { RenderBlock } from './types';

/**
 * Whether an installation block is worth rendering. Shared by all four block
 * renderers and by anchor assignment, so onboarding anchors are computed
 * against exactly the list the user sees.
 */
export function isBlockVisible(
  block: RenderBlock,
  getLocalizedText: (text: LocalizedText | undefined) => string,
): boolean {
  return Boolean(
    getLocalizedText(block.title) ||
    getLocalizedText(block.description) ||
    block.buttons?.length ||
    block.customNode,
  );
}
