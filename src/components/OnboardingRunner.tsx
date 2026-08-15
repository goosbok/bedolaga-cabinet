import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import Onboarding from './Onboarding';
import { isOnboardingDismissed, useOnboardingStore } from '../store/onboarding';

/**
 * Sections the bot's main menu deep-links into. Every one of these is a normal
 * destination a returning user picks on purpose, so the redirect below is
 * deliberately limited to them — payment results, gift links, merges and the
 * like must never be hijacked.
 */
const BOT_ENTRY_ROUTES = new Set([
  '/subscription',
  '/subscriptions',
  '/balance',
  '/referral',
  '/support',
  '/info',
  '/profile',
]);

/** One nudge per webview session, so reopening the app cannot loop the user. */
const ENTRY_NUDGE_KEY = '__onboarding_entry_nudge';

const alreadyNudged = (): boolean => {
  try {
    if (sessionStorage.getItem(ENTRY_NUDGE_KEY)) return true;
    sessionStorage.setItem(ENTRY_NUDGE_KEY, '1');
    return false;
  } catch {
    // Private mode or a locked-down webview: skip the nudge rather than risk
    // redirecting on every render with no way to remember we already did.
    return true;
  }
};

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
  const goTo = useOnboardingStore((state) => state.goTo);
  const skip = useOnboardingStore((state) => state.skip);
  const complete = useOnboardingStore((state) => state.complete);
  const abort = useOnboardingStore((state) => state.abort);

  const activeStep = isRunning ? steps[stepIndex] : undefined;
  const targetRoute = activeStep?.route;

  // Includes search, because the connection route carries ?sub=<id>.
  const currentUrl = `${location.pathname}${location.search}`;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;

  // `navigate` is deliberately kept out of the dependency array below. In
  // react-router 7 its identity changes when the location changes, so listing
  // it re-runs the effect on every navigation — which re-asserts the step's
  // route and yanks the user straight back. Measured: clicking the tour's own
  // "browse plans" link pushed /subscription/purchase, and 24ms later the
  // effect pushed / on top of it, trapping the user on the dashboard.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Every button in the bot's main menu opens the cabinet at its own section, so
  // a user arriving from Telegram usually never touches the dashboard — and the
  // step list is produced there, which meant the tour simply never started for
  // them. Send a first-time visitor to the dashboard once, on entry; from there
  // the tour takes over and walks them back out through its own steps.
  //
  // Entry only, and only from the menu's own destinations: someone who opens
  // /balance later in the session, or lands on a payment result, is left alone.
  const entryPathRef = useRef(location.pathname);
  useEffect(() => {
    if (useOnboardingStore.getState().hasStarted) return;
    if (isOnboardingDismissed()) return;
    if (!BOT_ENTRY_ROUTES.has(entryPathRef.current)) return;
    if (alreadyNudged()) return;
    navigateRef.current('/', { replace: true });
  }, []);

  // Navigate once, when the tour moves onto a step that lives on another page.
  // Nothing here reacts to the location itself: a user who walks away mid-step
  // stays away, the overlay simply hides until they return.
  useEffect(() => {
    if (!targetRoute) return;
    if (currentUrlRef.current === targetRoute) return;
    navigateRef.current(targetRoute);
  }, [stepIndex, targetRoute]);

  // The user did what the step told them to. Steps like "tap your subscription"
  // are instructions to navigate, so obeying one must not look like leaving the
  // tour — without this the overlay simply vanished, while pressing "Next"
  // instead kept it alive, which is precisely backwards.
  //
  // Only later steps are considered, so walking backwards or wandering off to an
  // unrelated page still just hides the overlay until the user returns.
  useEffect(() => {
    if (!isRunning || !targetRoute) return;
    if (currentUrl === targetRoute) return;
    const landed = steps.findIndex((step, i) => i > stepIndex && step.route === currentUrl);
    if (landed !== -1) goTo(landed);
  }, [currentUrl, isRunning, targetRoute, stepIndex, steps, goTo]);

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
