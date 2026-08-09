import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { displayName } from '../utils/displayName';
import { useBlockingStore } from '../store/blocking';
import { subscriptionApi } from '../api/subscription';
import { referralApi } from '../api/referral';
import { balanceApi } from '../api/balance';
import { wheelApi } from '../api/wheel';
import type { OnboardingStep } from '../components/Onboarding';
import { useOnboardingStore } from '../store/onboarding';
import PromoOffersSection from '../components/PromoOffersSection';
import NewsSection from '../components/news/NewsSection';
import SubscriptionCardActive from '../components/dashboard/SubscriptionCardActive';
import SubscriptionCardExpired from '../components/dashboard/SubscriptionCardExpired';
import TrialOfferCard from '../components/dashboard/TrialOfferCard';
import StatsGrid from '../components/dashboard/StatsGrid';
import { giftApi } from '../api/gift';
import { promoApi } from '../api/promo';
import PendingGiftCard from '../components/dashboard/PendingGiftCard';
import SubscriptionListCard from '../components/subscription/SubscriptionListCard';
import { API } from '../config/constants';
import { ChevronRightIcon, DevicesIcon, StarIcon } from '@/components/icons';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const startOnboarding = useOnboardingStore((state) => state.start);
  const setOnboardingSteps = useOnboardingStore((state) => state.setSteps);
  const setOnboardingHasEverConnected = useOnboardingStore((state) => state.setHasEverConnected);
  const isOnboardingRunning = useOnboardingStore((state) => state.isRunning);
  const blockingType = useBlockingStore((state) => state.blockingType);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Fetch balance from API
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: !isMultiTariff,
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: !subscription && !subLoading,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => subscriptionApi.getDevices(),
    enabled: !!subscription && !isMultiTariff,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  const { data: referralInfo, isLoading: refLoading } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
  });

  const { data: wheelConfig } = useQuery({
    queryKey: ['wheel-config'],
    queryFn: wheelApi.getConfig,
    staleTime: 60000,
    retry: false,
  });

  const { data: pendingGifts } = useQuery({
    queryKey: ['pending-gifts'],
    queryFn: giftApi.getPendingGifts,
    staleTime: 30_000,
    retry: false,
  });

  const { data: promoGroupData } = useQuery({
    queryKey: ['promo-group-discounts'],
    queryFn: promoApi.getGroupDiscounts,
    staleTime: 60_000,
    retry: false,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      setTrialError(error.response?.data?.detail || t('common.error'));
    },
  });

  // Traffic refresh state and mutation
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
  } | null>(null);

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      setTrafficData({
        traffic_used_gb: data.traffic_used_gb,
        traffic_used_percent: data.traffic_used_percent,
        is_unlimited: data.is_unlimited,
      });
      localStorage.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscription?.id] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (key: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficRefreshCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  // Cooldown timer
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Auto-refresh traffic on mount (with 30s caching)
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = localStorage.getItem(`traffic_refresh_ts_${subscription?.id ?? 'default'}`);
    const now = Date.now();
    const cacheMs = API.TRAFFIC_CACHE_MS;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  // В multi-tariff /cabinet/subscription отключён, поэтому subscriptionResponse=undefined.
  // Используем список из /cabinet/subscriptions/list — пустой массив означает «нет подписок»,
  // и тогда показываем TrialOfferCard. Без этой ветки multi-tariff юзер никогда не видел триал.
  const hasNoSubscription = isMultiTariff
    ? multiSubData !== undefined && (multiSubData.subscriptions?.length ?? 0) === 0
    : subscriptionResponse?.has_subscription === false && !subLoading;

  // Есть ли НАСТОЯЩАЯ (платная, не триал) живая подписка — от этого зависит CTA:
  // «+ Купить ещё» только при наличии платной; иначе явная «Посмотреть тарифы».
  const hasActivePaid = (multiSubData?.subscriptions ?? []).some(
    (s) => !s.is_trial && (s.status === 'active' || s.status === 'limited'),
  );

  // Which anchors exist right now. Each mirrors the render condition of the
  // element that carries it — see the truth table for this task. A step whose
  // anchor is missing costs the user a blank overlay and is then dropped, so
  // the step list must never outrun what is on screen.

  // Rendered by the multi-tariff list block or the no-subscription block.
  const hasPlansAnchor =
    hasNoSubscription || (isMultiTariff && (multiSubData?.subscriptions?.length ?? 0) > 0);

  // The subscription the tour hands off to /connection. In multi-tariff mode
  // `subscription` is null, so fall back to the first subscription in the list.
  const tourSubscriptionId = subscription?.id ?? multiSubData?.subscriptions?.[0]?.id ?? null;

  // Traffic on that same subscription, read the same way. Zero means the user
  // has never actually connected, which turns the guide link into a nudge.
  const tourSubscriptionTrafficGb =
    subscription?.traffic_used_gb ?? multiSubData?.subscriptions?.[0]?.traffic_used_gb ?? 0;

  // `connect-devices` sits on the installation-guide link below the
  // subscription block, which renders in both single- and multi-tariff mode
  // for anyone holding a subscription — expired ones included.
  const hasConnectDevicesAnchor = tourSubscriptionId !== null;

  // Traffic on ANY subscription proves the user got the VPN running at least
  // once. The store refuses to mark the tour done until that has happened.
  const hasEverConnected =
    (subscription?.traffic_used_gb ?? 0) > 0 ||
    (multiSubData?.subscriptions ?? []).some((s) => s.traffic_used_gb > 0);

  const onboardingSteps = useMemo<OnboardingStep[]>(() => {
    const steps: OnboardingStep[] = [
      {
        target: 'welcome',
        title: t('onboarding.steps.welcome.title'),
        description: t('onboarding.steps.welcome.description'),
        placement: 'bottom',
        route: '/',
      },
    ];

    if (hasNoSubscription && trialInfo?.is_available) {
      steps.push({
        target: 'trial-card',
        title: t('onboarding.steps.trial.title'),
        description: t('onboarding.steps.trial.description'),
        placement: 'bottom',
        route: '/',
      });
    }

    if (hasPlansAnchor) {
      steps.push({
        target: 'view-plans',
        title: t('onboarding.steps.plans.title'),
        description: t('onboarding.steps.plans.description'),
        placement: 'top',
        route: '/',
      });
    }

    if (hasConnectDevicesAnchor) {
      steps.push({
        target: 'connect-devices',
        title: t('onboarding.steps.connectDevices.title'),
        description: t('onboarding.steps.connectDevices.description'),
        placement: 'bottom',
        route: '/',
      });
    }

    if (tourSubscriptionId !== null) {
      const connectionRoute = `/connection?sub=${tourSubscriptionId}`;

      steps.push(
        {
          target: 'install-app',
          title: t('onboarding.steps.installApp.title'),
          description: t('onboarding.steps.installApp.description'),
          placement: 'bottom',
          route: connectionRoute,
        },
        {
          target: 'install-add-subscription',
          title: t('onboarding.steps.addSubscription.title'),
          description: t('onboarding.steps.addSubscription.description'),
          placement: 'bottom',
          route: connectionRoute,
        },
        {
          target: 'install-connect',
          title: t('onboarding.steps.connect.title'),
          description: t('onboarding.steps.connect.description'),
          placement: 'top',
          route: connectionRoute,
        },
      );
    }

    return steps;
  }, [
    t,
    hasNoSubscription,
    trialInfo?.is_available,
    hasPlansAnchor,
    hasConnectDevicesAnchor,
    tourSubscriptionId,
  ]);

  // Start once the data the step list depends on has settled. The store ignores
  // repeat calls, so re-publishing a changed list never rewinds the tour.
  useEffect(() => {
    if (subLoading || refLoading || blockingType) return;
    const timer = setTimeout(() => startOnboarding(onboardingSteps), 500);
    return () => clearTimeout(timer);
  }, [subLoading, refLoading, blockingType, startOnboarding, onboardingSteps]);

  // Keep a running tour in sync: activating the trial creates a subscription,
  // which unlocks the connect and installation steps without a reload.
  useEffect(() => {
    if (!isOnboardingRunning) return;
    setOnboardingSteps(onboardingSteps);
  }, [isOnboardingRunning, setOnboardingSteps, onboardingSteps]);

  // The other half of what the store needs to decide the tour is done.
  useEffect(() => {
    setOnboardingHasEverConnected(hasEverConnected);
  }, [setOnboardingHasEverConnected, hasEverConnected]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div data-onboarding="welcome">
        <h1 className="text-2xl font-bold text-dark-50 sm:text-3xl">
          {t('dashboard.welcome', { name: displayName(user) })}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-dark-400">{t('dashboard.yourSubscription')}</p>
          {promoGroupData?.group_name && (
            <span
              className="inline-flex max-w-[160px] items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: 'rgba(var(--color-accent-400), 0.1)',
                border: '1px solid rgba(var(--color-accent-400), 0.2)',
                color: 'rgb(var(--color-accent-400))',
              }}
            >
              <StarIcon filled className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{promoGroupData.group_name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Pending Gift Activations */}
      {pendingGifts && pendingGifts.length > 0 && <PendingGiftCard gifts={pendingGifts} />}

      {/* Multi-tariff: show subscription cards (max 3) — только когда подписки
          реально есть. Пустой случай (нет подписок) ведёт блок ниже (триал/покупка),
          иначе кнопка покупки дублировалась. */}
      {isMultiTariff && multiSubData?.subscriptions && multiSubData.subscriptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium opacity-60">
              {t('dashboard.subscriptions', 'Подписки')}
            </span>
            <Link to="/subscriptions" className="text-xs text-accent-400 hover:underline">
              {t('dashboard.manageAll', 'Управление')} →
            </Link>
          </div>
          {multiSubData.subscriptions.slice(0, 3).map((sub) => (
            <SubscriptionListCard
              key={sub.id}
              subscription={sub}
              onClick={() => navigate(`/subscriptions/${sub.id}`)}
            />
          ))}
          {multiSubData.subscriptions.length > 3 && (
            <Link
              to="/subscriptions"
              className="flex w-full items-center justify-center rounded-2xl border border-dashed border-white/15 p-3 text-xs opacity-50 transition-opacity hover:opacity-80"
            >
              {t('dashboard.showAll', 'Показать все')} ({multiSubData.subscriptions.length})
            </Link>
          )}
          {hasActivePaid ? (
            <Link
              to="/subscription/purchase"
              data-onboarding="view-plans"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500/15 p-3.5 text-sm font-medium text-accent-400 transition-all hover:bg-accent-500/25"
            >
              <span className="text-base">+</span>{' '}
              {t('subscriptions.buyAnother', 'Купить ещё тариф')}
            </Link>
          ) : (
            <Link
              to="/subscription/purchase"
              data-onboarding="view-plans"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
            >
              <span className="text-base">+</span>{' '}
              {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
            </Link>
          )}
        </div>
      )}

      {/* Subscription Status Card — hidden in multi-tariff (managed via /subscriptions) */}
      {!isMultiTariff && (
        <>
          {subLoading ? (
            <div className="bento-card">
              <div className="mb-4 flex items-center justify-between">
                <div className="skeleton h-5 w-20" />
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="skeleton mb-3 h-10 w-32" />
              <div className="skeleton mb-3 h-4 w-40" />
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="mt-5">
                <div className="skeleton h-12 w-full rounded-xl" />
              </div>
            </div>
          ) : subscription?.is_expired ||
            subscription?.status === 'disabled' ||
            subscription?.is_limited ? (
            <SubscriptionCardExpired
              subscription={subscription}
              balanceKopeks={balanceData?.balance_kopeks ?? 0}
              balanceRubles={balanceData?.balance_rubles ?? 0}
            />
          ) : subscription ? (
            <SubscriptionCardActive
              subscription={subscription}
              trafficData={trafficData}
              refreshTrafficMutation={refreshTrafficMutation}
              trafficRefreshCooldown={trafficRefreshCooldown}
              connectedDevices={devicesData?.total ?? 0}
            />
          ) : null}
        </>
      )}

      {/* Нет подписок: показываем триал (если доступен) и ВСЕГДА одну явную
          кнопку покупки. Триал не обязателен, чтобы попасть в витрину — раньше
          при доступном триале это был единственный экран без кнопки покупки
          (Telegram-баг #605056/#605063). Единственная кнопка тут (вместо дубля
          с мульти-тариф блоком). */}
      {hasNoSubscription && !trialLoading && (
        <div className="space-y-3">
          {trialInfo?.is_available && (
            <TrialOfferCard
              trialInfo={trialInfo}
              balanceKopeks={balanceData?.balance_kopeks || 0}
              balanceRubles={balanceData?.balance_rubles || 0}
              activateTrialMutation={activateTrialMutation}
              trialError={trialError}
              dataOnboarding="trial-card"
            />
          )}
          <Link
            to="/subscription/purchase"
            data-onboarding="view-plans"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
          >
            <span className="text-base">+</span>{' '}
            {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
          </Link>
        </div>
      )}

      {/* Permanent way into the installation guide. Otherwise it is reachable
          only via Subscription → card → «Подключить устройство», and that path
          thins out exactly when a lapsed user needs it most. Zero traffic on the
          linked subscription means the user never connected, so the link turns
          into a nudge — encouraging, never alarming. */}
      {tourSubscriptionId !== null && (
        <Link
          to={`/connection?sub=${tourSubscriptionId}`}
          data-onboarding="connect-devices"
          className={
            tourSubscriptionTrafficGb === 0
              ? 'flex w-full items-center gap-3 rounded-2xl bg-accent-500/15 p-3.5 text-left transition-colors hover:bg-accent-500/25'
              : 'flex w-full items-center gap-2.5 rounded-2xl border border-white/10 p-3.5 text-sm font-medium text-dark-300 transition-colors hover:bg-white/5 hover:text-dark-100'
          }
        >
          {tourSubscriptionTrafficGb === 0 ? (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/20 text-accent-400">
                <DevicesIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-dark-50">
                  {t('dashboard.connectGuide.nudgeTitle')}
                </span>
                <span className="mt-0.5 block text-xs text-dark-400">
                  {t('dashboard.connectGuide.nudgeDescription')}
                </span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-accent-400" />
            </>
          ) : (
            <>
              <DevicesIcon className="h-4 w-4 shrink-0 opacity-60" />
              <span className="flex-1">{t('dashboard.connectGuide.link')}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-dark-500" />
            </>
          )}
        </Link>
      )}

      {/* Promo Offers */}
      <PromoOffersSection />

      {/* Stats Grid */}
      <StatsGrid
        balanceRubles={balanceData?.balance_rubles || 0}
        referralCount={referralInfo?.total_referrals || 0}
        earningsRubles={referralInfo?.available_balance_rubles || 0}
        refLoading={refLoading}
      />

      {/* Fortune Wheel Banner */}
      {wheelConfig?.is_enabled && (
        <Link to="/wheel" className="bento-card-hover group flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-3xl">🎰</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-dark-100">{t('wheel.banner.title')}</h3>
              <p className="text-sm text-dark-400">{t('wheel.banner.description')}</p>
            </div>
          </div>
          <div className="flex-shrink-0 text-dark-500 transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent-400">
            <ChevronRightIcon />
          </div>
        </Link>
      )}

      {/* News Section */}
      <NewsSection />
    </div>
  );
}
