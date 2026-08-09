import type { GetLocalizedText, RenderBlock } from './types';
import { getVisibleBlocks } from './visibility';

/** Tour target for the "install the app" step. */
export const ANCHOR_INSTALL_APP = 'install-app';
/** Tour target for the "load the subscription into the app" step. */
export const ANCHOR_ADD_SUBSCRIPTION = 'install-add-subscription';
/** Tour target for the closing "turn the VPN on" step. */
export const ANCHOR_CONNECT = 'install-connect';

/**
 * Tags installation blocks with onboarding anchors.
 *
 * Anchors are derived from meaning, never from a position index: the panel
 * config ships 3 to 5 blocks depending on platform and app, so "Add
 * Subscription" is the second block on iOS but the third on Linux/Koala Clash.
 *
 * - first visible block            -> install-app
 * - block with a subscriptionLink  -> install-add-subscription
 * - last visible block             -> install-connect
 *
 * The subscription block wins any collision, because it is the step the user
 * must actually complete. A block that gets no anchor is simply not a tour
 * target; the tour engine skips steps whose target is absent.
 */
export function assignOnboardingAnchors(
  blocks: RenderBlock[],
  getLocalizedText: GetLocalizedText,
): RenderBlock[] {
  // Same producer the renderers use, so anchors are computed over exactly the
  // list that reaches the screen.
  const visible = getVisibleBlocks(blocks, getLocalizedText);
  if (!visible.length) return blocks;

  const anchors = new Map<RenderBlock, string>();

  const subscriptionBlock = visible.find((b) =>
    b.buttons?.some((button) => button.type === 'subscriptionLink'),
  );
  if (subscriptionBlock) anchors.set(subscriptionBlock, ANCHOR_ADD_SUBSCRIPTION);

  const first = visible[0];
  if (!anchors.has(first)) anchors.set(first, ANCHOR_INSTALL_APP);

  const last = visible[visible.length - 1];
  if (!anchors.has(last)) anchors.set(last, ANCHOR_CONNECT);

  return blocks.map((block) => {
    const anchor = anchors.get(block);
    return anchor ? { ...block, onboardingAnchor: anchor } : block;
  });
}
