import { useState, useEffect, useRef } from 'react';

import { computeBlockerRects } from './onboardingBlockers';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/** Only the four values the spotlight and tooltip are positioned from. */
const isSameRect = (a: DOMRect, b: DOMRect): boolean =>
  a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/**
 * How long an `awaitsUserAction` step is shown without a "Next" before one
 * appears anyway.
 *
 * The escape hatch is not optional: two of those steps can dead-end. Trial
 * activation can fail (the dashboard renders an error and no subscription is
 * created), and "Connect Device" is disabled once the user is at their device
 * limit, so pressing it does nothing. Without this the tooltip would offer only
 * "Skip", which ends the tour for good — the worst possible answer for someone
 * who just hit an error.
 */
const ACTION_STEP_NEXT_DELAY_MS = 10_000;

export interface OnboardingStep {
  target: string; // data-onboarding attribute value
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  /** Route this step lives on. The runner navigates here before the step shows. */
  route?: string;
  /**
   * This step asks the user to press something real, and that press is what
   * advances the tour — activating the trial republishes the step list, and
   * tapping through to another screen is picked up by the runner's
   * landing detection. The tooltip hides "Next" so the tour cannot be clicked
   * past the doing (it comes back after `ACTION_STEP_NEXT_DELAY_MS`, see above).
   *
   * Leave it unset on a step that has nothing to press, and on one whose control
   * leads *off* the tour's path — a purchase page, an app store, a `happ://`
   * link — because there pressing it must not be the only way forward.
   */
  awaitsUserAction?: boolean;
}

interface OnboardingProps {
  steps: OnboardingStep[];
  /** Active step, owned by the caller so the tour survives route changes. */
  stepIndex: number;
  onStepChange: (index: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  /**
   * The last step's target never appeared, so the tour ends without having been
   * walked to the end. Distinct from `onComplete` on purpose: the caller must be
   * able to tell "the user finished" from "we gave up".
   */
  onAbort: () => void;
}

export default function Onboarding({
  steps,
  stepIndex,
  onStepChange,
  onComplete,
  onSkip,
  onAbort,
}: OnboardingProps) {
  const { t } = useTranslation();
  const currentStep = stepIndex;
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [actionStepTimedOut, setActionStepTimedOut] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const onStepChangeRef = useRef(onStepChange);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  }, [onStepChange]);

  const onAbortRef = useRef(onAbort);
  useEffect(() => {
    onAbortRef.current = onAbort;
  }, [onAbort]);

  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  const step = steps[currentStep];

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;
    const isLastStep = currentStep === steps.length - 1;

    setIsVisible(false);
    setTargetRect(null);

    const tryFind = () => {
      if (cancelled) return;
      const target = document.querySelector(`[data-onboarding="${step.target}"]`);
      if (target) {
        const rect = target.getBoundingClientRect();
        setTargetRect(rect);
        // Centring a tall card leaves no room either side of it on a phone, and
        // the tooltip then has nowhere to go but on top of the control the step
        // is telling the user to press. Pinning such a target to the top keeps
        // its lower half — where the action button lives — clear of the tooltip.
        const isTall = rect.height > window.innerHeight * 0.5;
        target.scrollIntoView({ behavior: 'smooth', block: isTall ? 'start' : 'center' });
        window.setTimeout(() => {
          if (!cancelled) setIsVisible(true);
        }, 100);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryFind, 200);
        return;
      }
      if (isLastStep) {
        // Ran out of attempts on the final step: the user was never actually
        // shown it, so this is an abort, not a completion.
        onAbortRef.current();
      } else {
        onStepChangeRef.current(Math.min(currentStep + 1, steps.length - 1));
      }
    };

    const timer = window.setTimeout(tryFind, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.target]);

  // Recalculate position on resize/scroll, and on any relayout that moves the
  // target.
  //
  // resize/scroll alone leave the cached rect stale: /connection's block list is
  // server-driven and changes length when the user picks another platform or
  // app, which moves the anchored block without either event firing — the
  // spotlight then sits over whatever took over the old rect while the tooltip
  // still describes the step. A ResizeObserver covers that without polling.
  //
  // It has to watch the target's *ancestors*, not just the target and <body>:
  // switching macOS -> Linux grows <main> from 637px to 820px and pushes the
  // anchored block down 56px while <body> stays pinned at its `min-h-viewport`
  // floor and the block's own box never changes size at all. Observing only the
  // target and <body> reports nothing for that half of the switch.
  //
  // `isVisible` is a dependency so the chain gets attached at the moment the
  // step engine has confirmed the target is on the page — a step that navigates
  // first would otherwise set up while its target is still unmounted.
  useEffect(() => {
    const selector = `[data-onboarding="${step.target}"]`;
    let observed: Element | null = null;

    const observer = new ResizeObserver(() => updatePosition());

    // Re-observe from scratch whenever the target changes identity: a relayout
    // that swaps the block list also swaps the DOM nodes, and the old chain
    // belongs to elements that are no longer on the page.
    function observeChain(target: Element) {
      observer.disconnect();
      for (let node: Element | null = target; node; node = node.parentElement) {
        observer.observe(node);
      }
      observed = target;
    }

    function updatePosition() {
      const target = document.querySelector(selector);
      if (!target) return;
      if (target !== observed) observeChain(target);
      const rect = target.getBoundingClientRect();
      // The observer can fire as a result of this component's own re-render, so
      // commit only a rect that actually moved — otherwise the two feed back
      // into each other.
      setTargetRect((prev) => (prev && isSameRect(prev, rect) ? prev : rect));
    }

    updatePosition();
    // Covers the target not being on the page yet: the step engine polls for it
    // for ~1.3s, and <body> growing as that content mounts brings us back here
    // to pick it up and observe its chain.
    observer.observe(document.body);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step.target, isVisible]);

  // Give every step that waits on the user its own grace period: the timer is
  // torn down and restarted whenever the step changes, by index or by identity
  // (activating the trial rebuilds the list under a stable index).
  useEffect(() => {
    setActionStepTimedOut(false);
    if (!step.awaitsUserAction) return;
    const timer = window.setTimeout(() => setActionStepTimedOut(true), ACTION_STEP_NEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentStep, step.target, step.awaitsUserAction]);

  // An action step hides "Next" so the only way on is doing the thing — until
  // the grace period above expires and hands the user a way out regardless.
  const showNext = !step.awaitsUserAction || actionStepTimedOut;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      onStepChange(currentStep + 1);
    } else {
      onComplete();
    }
  };

  // The tour is deliberately non-modal: the highlighted control stays live so
  // "press this button" steps can actually be pressed. That rules out a focus
  // trap (it would make the control unreachable by keyboard), so Escape is
  // wired up directly instead of through useFocusTrap's onEscape.
  //
  // Registered in the capture phase and stopped immediately, so that while the
  // tour is up Escape is the tour's and nothing else's. /connection also closes
  // itself on Escape; it guards on `isRunning`, but a bubble-phase listener here
  // clears that flag before the guard ever reads it, so Escape both dismissed
  // the tour and threw the user back to `/`. A capture-phase document listener
  // always precedes bubble-phase document listeners, so this no longer depends
  // on which component happened to mount — and register — first.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSkipRef.current();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Park focus on the tooltip as each step appears, so a screen reader announces
  // the explanation and Tab continues from here into the page — onto the
  // highlighted control — rather than cycling inside the tooltip.
  useEffect(() => {
    if (!isVisible) return;
    tooltipRef.current?.focus({ preventScroll: true });
  }, [isVisible, currentStep]);

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { opacity: 0 };

    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 150;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case 'bottom':
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = targetRect.top - tooltipHeight - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - padding;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + padding;
        break;
    }

    // Keep within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < padding) left = padding;
    if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipHeight > viewportHeight - padding) {
      top = viewportHeight - tooltipHeight - padding;
    }

    // Never sit on top of the thing being pointed at. Clamping to the viewport
    // above can drop the tooltip squarely over the target on a short screen,
    // which is fatal for an action step: the button the text names is then
    // underneath the text naming it. Reported from a phone, where the tooltip
    // covered "Активировать бесплатно" on the trial card.
    const gap = 12;
    const overlapsTarget =
      top < targetRect.bottom + gap && top + tooltipHeight > targetRect.top - gap;
    if (overlapsTarget) {
      const roomBelow = viewportHeight - targetRect.bottom - padding;
      const roomAbove = targetRect.top - padding;
      top =
        roomBelow >= roomAbove
          ? Math.min(targetRect.bottom + gap, viewportHeight - tooltipHeight - padding)
          : Math.max(padding, targetRect.top - tooltipHeight - gap);
    }

    return {
      top,
      left,
      width: tooltipWidth,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1)' : 'scale(0.95)',
    };
  };

  // The frame is computed by computeBlockerRects, which is tested directly:
  // getting the hole wrong would make the control a step names unpressable, and
  // that is a worse failure than the stray taps this shield exists to stop.
  //
  // Only click is intercepted, deliberately — touch scrolling still reaches the
  // page, so a user is never stuck on a screen they cannot move.
  const blockerRects = isVisible ? computeBlockerRects(targetRect) : [];

  // Spotlight style
  const getSpotlightStyle = (): React.CSSProperties => {
    if (!targetRect) return { opacity: 0 };

    const padding = 8;
    return {
      top: targetRect.top - padding,
      left: targetRect.left - padding,
      width: targetRect.width + padding * 2,
      height: targetRect.height + padding * 2,
      opacity: isVisible ? 1 : 0,
    };
  };

  return createPortal(
    <div className="onboarding-overlay" style={{ opacity: isVisible ? 1 : 0 }}>
      {/* Click shield: everything except the highlighted control */}
      {blockerRects.map((rect, i) => (
        <div
          key={i}
          className="onboarding-blocker"
          style={rect}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      ))}

      {/* Spotlight */}
      <div className="onboarding-spotlight" style={getSpotlightStyle()} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        // No aria-modal: the rest of the UI stays interactive on purpose, and
        // claiming modality would hide the highlighted control from AT.
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
        tabIndex={-1}
        className={`onboarding-tooltip tooltip-${step.placement}`}
        style={{
          ...getTooltipStyle(),
          // Not redundant with the stylesheet's `pointer-events-auto`: the
          // 'none' branch is the point — it keeps the faded-out tooltip from
          // swallowing clicks while a step transitions.
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
      >
        {/* Progress indicator */}
        <div className="mb-4 flex items-center gap-1.5">
          {steps.map((s, index) => (
            <div
              key={s.target}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'w-6 bg-accent-500'
                  : index < currentStep
                    ? 'w-2 bg-accent-500/50'
                    : 'w-2 bg-dark-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <h3 id="onboarding-title" className="mb-2 text-lg font-semibold text-dark-50">
          {step.title}
        </h3>
        <p id="onboarding-desc" className="mb-5 text-sm text-dark-400">
          {step.description}
        </p>

        {/* Actions. No visible "skip": the tour is short and only ever shown to
            someone who has not connected yet, so the product choice is to keep
            guiding rather than offer an exit on every step. Escape still ends it
            for keyboard users. */}
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            {showNext && (
              <button onClick={handleNext} className="btn-primary px-4 py-1.5 text-sm">
                {currentStep === steps.length - 1
                  ? t('onboarding.finish', 'Finish')
                  : t('common.next', 'Next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
