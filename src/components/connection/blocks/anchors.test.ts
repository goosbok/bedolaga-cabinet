import { describe, expect, it } from 'vitest';
import { assignOnboardingAnchors } from './anchors';
import type { RenderBlock } from './types';

const getText = (t: { en?: string } | undefined) => t?.en ?? '';

const b = (title: string, over: Partial<RenderBlock> = {}) => ({
  title: { en: title },
  description: {},
  ...over,
});

const subButton = { buttons: [{ text: {}, type: 'subscriptionLink' as const }] };
const extButton = { buttons: [{ text: {}, type: 'external' as const }] };

const anchorsOf = (blocks: RenderBlock[]) =>
  assignOnboardingAnchors(blocks, getText).map((x) => x.onboardingAnchor);

describe('assignOnboardingAnchors', () => {
  it('handles the 3-block Happ layout (iOS, macOS, Android, Windows)', () => {
    expect(
      anchorsOf([
        b('App Installation', extButton),
        b('Add Subscription', subButton),
        b('Connect and use'),
      ]),
    ).toEqual(['install-app', 'install-add-subscription', 'install-connect']);
  });

  it('handles the 4-block TV layout where the extra block sits in the middle', () => {
    expect(
      anchorsOf([
        b('App Installation', extButton),
        b('Installation instructions'),
        b('Add Subscription', subButton),
        b('Connect and use'),
      ]),
    ).toEqual(['install-app', undefined, 'install-add-subscription', 'install-connect']);
  });

  it('handles the 5-block Linux layout where Add Subscription is third', () => {
    expect(
      anchorsOf([
        b('App Installation', extButton),
        b('Warning'),
        b('Add Subscription', subButton),
        b('If the subscription is not added'),
        b('Connect and use'),
      ]),
    ).toEqual(['install-app', undefined, 'install-add-subscription', undefined, 'install-connect']);
  });

  it('skips invisible blocks when deciding first and last', () => {
    const empty = { title: {}, description: {} };
    expect(
      anchorsOf([
        empty,
        b('App Installation', extButton),
        b('Add Subscription', subButton),
        b('Connect and use'),
        empty,
      ]),
    ).toEqual([undefined, 'install-app', 'install-add-subscription', 'install-connect', undefined]);
  });

  it('gives the subscription block precedence when it is also the last block', () => {
    expect(anchorsOf([b('App Installation', extButton), b('Add Subscription', subButton)])).toEqual(
      ['install-app', 'install-add-subscription'],
    );
  });

  it('gives the subscription block precedence when it is also the only block', () => {
    expect(anchorsOf([b('Add Subscription', subButton)])).toEqual(['install-add-subscription']);
  });

  it('assigns no subscription anchor when no block has a subscriptionLink button', () => {
    expect(anchorsOf([b('App Installation', extButton), b('Connect and use')])).toEqual([
      'install-app',
      'install-connect',
    ]);
  });

  it('returns an empty list unchanged', () => {
    expect(assignOnboardingAnchors([], getText)).toEqual([]);
  });

  it('does not mutate the input blocks', () => {
    const input = [b('App Installation', extButton), b('Add Subscription', subButton)];
    assignOnboardingAnchors(input, getText);
    expect(input.every((x) => x.onboardingAnchor === undefined)).toBe(true);
  });
});
