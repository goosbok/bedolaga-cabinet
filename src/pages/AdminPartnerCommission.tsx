import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { partnerApi } from '../api/partners';
import { AdminBackButton } from '../components/admin';

export default function AdminPartnerCommission() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Try to get current commission from navigate state
  const passedState = location.state as {
    currentCommission?: number;
    currentMaxPayments?: number;
  } | null;
  const passedCommission = passedState?.currentCommission;
  const passedMaxPayments = passedState?.currentMaxPayments;

  const { data: partner } = useQuery({
    queryKey: ['admin-partner-detail', userId],
    queryFn: () => partnerApi.getPartnerDetail(Number(userId)),
    enabled: passedCommission === undefined && !!userId,
  });

  const currentCommission = passedCommission ?? partner?.commission_percent ?? 0;
  const currentMaxPayments = passedMaxPayments ?? partner?.max_commission_payments ?? 0;
  const [commissionValue, setCommissionValue] = useState(String(currentCommission));
  const [maxPaymentsValue, setMaxPaymentsValue] = useState(String(currentMaxPayments));

  // Sync commission value when data loads asynchronously
  useEffect(() => {
    if (partner?.commission_percent != null && passedCommission === undefined) {
      setCommissionValue(String(partner.commission_percent));
    }
  }, [partner?.commission_percent, passedCommission]);

  useEffect(() => {
    if (partner?.max_commission_payments != null && passedMaxPayments === undefined) {
      setMaxPaymentsValue(String(partner.max_commission_payments));
    }
  }, [partner?.max_commission_payments, passedMaxPayments]);

  const updateMutation = useMutation({
    mutationFn: ({ commission, maxPayments }: { commission: number; maxPayments: number }) =>
      partnerApi.updateCommission(Number(userId), commission, maxPayments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      navigate(`/admin/partners/${userId}`);
    },
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <AdminBackButton to={`/admin/partners/${userId}`} />
        <h1 className="text-xl font-semibold text-dark-100">
          {t('admin.partnerDetail.commissionDialog.title')}
        </h1>
      </div>

      <div className="rounded-xl border border-dark-700 bg-dark-800 p-6">
        <p className="mb-4 text-sm text-dark-400">
          {t('admin.partnerDetail.commissionDialog.description')}
        </p>

        <div className="mb-2 text-sm text-dark-500">
          {t('admin.partnerDetail.commission.title')}: {currentCommission}%{' · '}
          {t('admin.partnerDetail.commission.paymentsTitle')}:{' '}
          {currentMaxPayments === 0
            ? t('admin.partnerDetail.commission.unlimited')
            : currentMaxPayments}
        </div>

        <label className="mb-1 block text-sm font-medium text-dark-300">
          {t('admin.partnerDetail.commissionDialog.label')}
        </label>
        <input
          type="number"
          min="1"
          max="100"
          value={commissionValue}
          onChange={(e) => setCommissionValue(e.target.value)}
          className="mb-4 w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-dark-100 outline-none focus:border-accent-500"
        />

        <label className="mb-1 block text-sm font-medium text-dark-300">
          {t('admin.partnerDetail.commissionDialog.maxPaymentsLabel')}
        </label>
        <input
          type="number"
          min="0"
          max="1000"
          value={maxPaymentsValue}
          onChange={(e) => setMaxPaymentsValue(e.target.value)}
          className="mb-1 w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-dark-100 outline-none focus:border-accent-500"
        />
        <p className="mb-6 text-xs text-dark-500">
          {t('admin.partnerDetail.commissionDialog.maxPaymentsHint')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/admin/partners/${userId}`)}
            className="flex-1 rounded-lg bg-dark-700 px-4 py-3 text-dark-300 transition-colors hover:bg-dark-600 hover:text-dark-100"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              const val = Number(commissionValue);
              const payments = Number(maxPaymentsValue);
              if (val >= 1 && val <= 100 && payments >= 0) {
                updateMutation.mutate({ commission: val, maxPayments: payments });
              }
            }}
            disabled={
              updateMutation.isPending ||
              !commissionValue ||
              Number(commissionValue) < 1 ||
              Number(commissionValue) > 100 ||
              maxPaymentsValue === '' ||
              Number(maxPaymentsValue) < 0
            }
            className="flex-1 rounded-lg bg-accent-500 px-4 py-3 font-medium text-on-accent transition-colors hover:bg-accent-600 disabled:opacity-50"
          >
            {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>

        {updateMutation.isError && (
          <div className="mt-4 rounded-lg bg-error-500/10 p-3 text-sm text-error-400">
            {t('common.error')}
          </div>
        )}
      </div>
    </div>
  );
}
