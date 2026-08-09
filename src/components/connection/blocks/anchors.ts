import type { GetLocalizedText, RenderBlock } from './types';
import { getVisibleBlocks } from './visibility';

/** Tour target for the "install the app" step. */
export const ANCHOR_INSTALL_APP = 'install-app';
/** Tour target for the "load the subscription into the app" step. */
export const ANCHOR_ADD_SUBSCRIPTION = 'install-add-subscription';
/** Tour target for the closing "turn the VPN on" step. */
export const ANCHOR_CONNECT = 'install-connect';

/**
 * Every anchor this module can assign. Narrower than `string` so a typo in a
 * consumer — a renderer's `data-onboarding`, a tour step's target — is a
 * compile error rather than a step that silently never fires.
 */
export type OnboardingAnchor =
  | typeof ANCHOR_INSTALL_APP
  | typeof ANCHOR_ADD_SUBSCRIPTION
  | typeof ANCHOR_CONNECT;

/** A block is the "add subscription" step when it carries the deep-link button. */
const hasSubscriptionLinkButton = (block: RenderBlock): boolean =>
  Boolean(block.buttons?.some((button) => button.type === 'subscriptionLink'));

/**
 * Position of the add-subscription block in the given array, or -1.
 *
 * Callers that need to place something on that step must use this rather than a
 * literal index: the panel config puts it at index 1 on phones and desktops but
 * at index 2 on TV layouts, which carry an extra instructions block.
 */
export function findSubscriptionBlockIndex(blocks: RenderBlock[]): number {
  return blocks.findIndex(hasSubscriptionLinkButton);
}

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
 *
 * If several blocks carry a subscriptionLink button — a panel admin may well
 * put a second one on the Linux "If the subscription is not added" block — the
 * first one wins: it is the step the user reaches first.
 *
 * Must run AFTER any `customNode` injection. `customNode` counts towards
 * visibility, so injecting one can make an otherwise-empty block visible and
 * change which block is first or last. Nothing in the code enforces this.
 */
export function assignOnboardingAnchors(
  blocks: RenderBlock[],
  getLocalizedText: GetLocalizedText,
): RenderBlock[] {
  // Same producer the renderers use, so anchors are computed over exactly the
  // list that reaches the screen.
  const visible = getVisibleBlocks(blocks, getLocalizedText);
  if (!visible.length) return blocks;

  const anchors = new Map<RenderBlock, OnboardingAnchor>();

  const subscriptionBlock = visible.find(hasSubscriptionLinkButton);
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
