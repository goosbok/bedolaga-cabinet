import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface OnboardingStep {
  target: string; // data-onboarding attribute value
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  /** Route this step lives on. The runner navigates here before the step shows. */
  route?: string;
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
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Recalculate position on resize/scroll
  useEffect(() => {
    const updatePosition = () => {
      const target = document.querySelector(`[data-onboarding="${step.target}"]`);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step.target]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      onStepChange(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      onStepChange(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  // The tour is deliberately non-modal: the highlighted control stays live so
  // "press this button" steps can actually be pressed. That rules out a focus
  // trap (it would make the control unreachable by keyboard), so Escape is
  // wired up directly instead of through useFocusTrap's onEscape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onSkipRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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

    return {
      top,
      left,
      width: tooltipWidth,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1)' : 'scale(0.95)',
    };
  };

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

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-dark-500 transition-colors hover:text-dark-300"
          >
            {t('onboarding.skip', 'Skip')}
          </button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <button onClick={handlePrev} className="btn-ghost px-3 py-1.5 text-sm">
                {t('common.back', 'Back')}
              </button>
            )}
            <button onClick={handleNext} className="btn-primary px-4 py-1.5 text-sm">
              {currentStep === steps.length - 1
                ? t('onboarding.finish', 'Finish')
                : t('common.next', 'Next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
