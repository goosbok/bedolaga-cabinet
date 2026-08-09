import type { ReactNode } from 'react';
import type { RemnawaveBlockClient, RemnawaveButtonClient, LocalizedText } from '@/types';

/**
 * A block to render. Beyond the panel's data (title/description/buttons), it may
 * carry `customNode` — extra interactive content (e.g. the Happ TV connect
 * widget) that every renderer drops into the block body, so it inherits the
 * active style (cards/timeline/accordion/minimal) instead of clashing with it.
 */
export type RenderBlock = RemnawaveBlockClient & {
  customNode?: ReactNode;
  /**
   * Onboarding tour target, assigned by `assignOnboardingAnchors`. Rendered as
   * `data-onboarding` so the tour can spotlight this block.
   */
  onboardingAnchor?: string;
};

/** Resolves a panel-provided localized field to the active language's string. */
export type GetLocalizedText = (text: LocalizedText | undefined) => string;

export interface BlockRendererProps {
  blocks: RenderBlock[];
  isMobile: boolean;
  isLight: boolean;
  getLocalizedText: GetLocalizedText;
  getSvgHtml: (key: string | undefined) => string;
  renderBlockButtons: (
    buttons: RemnawaveButtonClient[] | undefined,
    variant: 'light' | 'subtle',
  ) => React.ReactNode;
}
