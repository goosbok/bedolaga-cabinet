import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import Onboarding from './Onboarding';
import { useOnboardingStore } from '../store/onboarding';

/**
 * Drives the onboarding tour for the whole app.
 *
 * Lives in AppShell rather than on a page: the tour spans the dashboard and
 * /connection, and a page-level owner would unmount — killing the tour — the
 * moment it navigated. Step content is produced by the page that owns the data
 * (Dashboard); this component only advances, navigates and renders.
 */
export default function OnboardingRunner() {
  const navigate = useNavigate();
  const location = useLocation();

  const steps = useOnboardingStore((state) => state.steps);
  const stepIndex = useOnboardingStore((state) => state.stepIndex);
  const isRunning = useOnboardingStore((state) => state.isRunning);
  const next = useOnboardingStore((state) => state.next);
  const prev = useOnboardingStore((state) => state.prev);
  const skip = useOnboardingStore((state) => state.skip);
  const complete = useOnboardingStore((state) => state.complete);
  const abort = useOnboardingStore((state) => state.abort);

  const activeStep = isRunning ? steps[stepIndex] : undefined;
  const targetRoute = activeStep?.route;

  // Includes search, because the connection route carries ?sub=<id>.
  const currentUrl = `${location.pathname}${location.search}`;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;

  // Navigate once, when the tour moves onto a step that lives on another page.
  // The current location is deliberately read through a ref instead of being a
  // dependency: re-asserting the route on every location change would pin the
  // user to /connection — browser Back would bounce straight forward again and
  // every nav link would be undone within a frame.
  useEffect(() => {
    if (!targetRoute) return;
    if (currentUrlRef.current === targetRoute) return;
    navigate(targetRoute);
  }, [stepIndex, targetRoute, navigate]);

  if (!isRunning || !activeStep) return null;

  // Hold the overlay back until the step's page is actually current. The engine
  // gives a target about 1.3s to appear and then silently skips the step; if it
  // started hunting while the previous page was still mounted, a slow route
  // chunk or API round-trip would cost the user that step.
  if (targetRoute && currentUrl !== targetRoute) return null;

  return (
    <Onboarding
      steps={steps}
      stepIndex={stepIndex}
      onStepChange={(index) => {
        // The store owns clamping; the engine only ever moves by one.
        if (index > stepIndex) next();
        else if (index < stepIndex) prev();
      }}
      onComplete={complete}
      onSkip={skip}
      onAbort={abort}
    />
  );
}
