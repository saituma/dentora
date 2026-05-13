'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { StaffReviewConsole } from './staff-review-console';
import {
  useGetStaffReviewAlertsDueQuery,
  useGetStaffReviewDailyDigestQuery,
  useGetStaffReviewItemsQuery,
  useUpdateStaffReviewItemStatusMutation,
  type StaffReviewFilters,
  type StaffReviewStatus,
} from '@/features/staffReview/staffReviewApi';

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  const fetchError = error as FetchBaseQueryError;
  if (typeof fetchError === 'object' && fetchError && 'status' in fetchError) {
    return `Unable to load staff review queue (${String(fetchError.status)}).`;
  }
  return 'Unable to load staff review queue.';
}

export default function StaffReviewPage() {
  const [filters, setFilters] = useState<StaffReviewFilters>({ status: 'open', limit: 100 });
  const itemsQuery = useGetStaffReviewItemsQuery(filters);
  const alertsQuery = useGetStaffReviewAlertsDueQuery({ limit: 25 });
  const digestQuery = useGetStaffReviewDailyDigestQuery({ limit: 200 });
  const [updateStatus, updateStatusState] = useUpdateStaffReviewItemStatusMutation();

  const errorMessage = useMemo(
    () =>
      getErrorMessage(itemsQuery.error) ??
      getErrorMessage(alertsQuery.error) ??
      getErrorMessage(digestQuery.error),
    [alertsQuery.error, digestQuery.error, itemsQuery.error],
  );

  const handleFilterChange = (
    key: keyof Pick<StaffReviewFilters, 'status' | 'severity' | 'type' | 'source'>,
    value: StaffReviewFilters[typeof key],
  ) => {
    setFilters((current) => {
      const next = { ...current, [key]: value, limit: current.limit ?? 100 };
      if (!value) delete next[key];
      return next;
    });
  };

  const handleStatusChange = async (id: string, status: StaffReviewStatus) => {
    try {
      await updateStatus({ id, status }).unwrap();
      toast.success('Review item updated');
    } catch {
      toast.error('Failed to update review item');
    }
  };

  const handleRefresh = () => {
    void itemsQuery.refetch();
    void alertsQuery.refetch();
    void digestQuery.refetch();
  };

  return (
    <StaffReviewConsole
      alerts={alertsQuery.data?.data ?? []}
      digest={digestQuery.data?.data ?? null}
      errorMessage={errorMessage}
      filters={filters}
      isLoading={itemsQuery.isLoading || alertsQuery.isLoading || digestQuery.isLoading}
      isUpdating={updateStatusState.isLoading}
      items={itemsQuery.data?.data ?? []}
      onClearFilters={() => setFilters({ status: 'open', limit: 100 })}
      onFilterChange={handleFilterChange}
      onRefresh={handleRefresh}
      onStatusChange={handleStatusChange}
    />
  );
}
