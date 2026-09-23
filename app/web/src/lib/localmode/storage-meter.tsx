// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/local-first/storage-meter/storage-meter.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the @/ import aliases removed; bytes are formatted by the app's decimal formatter (so
// "386 MB" here matches the size Hugging Face shows) instead of LocalMode's 1024-based one; shadcn tokens remapped to
// the carbon identity (a tinted `.ff` field, typed values, square meter); `refreshKey` prop added so the meter
// re-reads the quota after a model is downloaded or deleted; says whether the browser may evict the data.
import * as React from 'react';
import { formatBytes } from '../../utils/format';
import { useStorageQuota } from './use-environment';

import { cn } from './utils';

/** Props for {@link StorageMeter}. */
export interface StorageMeterProps {
  /**
   * Fraction (0–1) at which the meter enters its warning state.
   * @default 0.8
   */
  warnThreshold?: number;
  /**
   * Override the live quota source (used / total bytes). When omitted the
   * component reads `useStorageQuota()`.
   */
  quota?: { usedBytes: number; quotaBytes: number };
  /** Change this value to make the meter re-read the browser's estimate. */
  refreshKey?: unknown;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Shows origin storage usage against quota as a meter, with a
 * warning state past a configurable threshold. Storage estimates are
 * approximate and blocked in some browsers (e.g. Safari private mode), so the
 * component degrades to a graceful "unavailable" state rather than erroring.
 *
 * Bind it to `useStorageQuota` (the default) or pass an explicit `quota`.
 *
 * @example
 * ```tsx
 * <StorageMeter warnThreshold={0.9} />
 * ```
 */
export function StorageMeter({
  warnThreshold = 0.8,
  quota,
  refreshKey,
  className,
}: StorageMeterProps) {
  const live = useStorageQuota();
  const source = quota ?? live.quota;
  const loading = quota ? false : live.isLoading;
  const refresh = live.refresh;

  React.useEffect(() => {
    if (refreshKey !== undefined) void refresh();
  }, [refreshKey, refresh]);

  if (!source || source.quotaBytes <= 0) {
    return (
      <div role="status" className={cn('ff', className)}>
        <span className="ff-label">Storage used by this app</span>
        <span className="typed">
          {loading ? 'estimating' : 'the browser does not report an estimate'}
        </span>
      </div>
    );
  }

  const fraction = Math.max(0, Math.min(1, source.usedBytes / source.quotaBytes));
  const percent = Math.round(fraction * 100);
  const warning = fraction >= warnThreshold;
  const persisted = live.quota?.isPersisted;

  return (
    <div role="status" aria-live="polite" className={cn('ff', className)}>
      <span className="ff-label">Storage used by this app, models included</span>
      <span className={cn('typed', warning && 'text-warning')}>
        {formatBytes(source.usedBytes)} of {formatBytes(source.quotaBytes)} allowed
      </span>
      <div
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative mt-1.5 h-1.5 w-full overflow-hidden bg-base-100"
      >
        <div
          className={cn('h-full', warning ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${Math.max(percent, fraction > 0 ? 1 : 0)}%` }}
        />
      </div>
      {warning && (
        <p className="mt-1 text-xs text-warning">
          Storage is {percent}% full. Delete a downloaded model to free space.
        </p>
      )}
      {persisted === false && (
        <p className="mt-1 text-xs text-base-content/70">
          The browser has not promised to keep this data: it may clear the downloaded models when the device runs low on
          space, and Safari clears it after about a week without a visit. Downloading again is the only way back — a
          download cannot resume.
        </p>
      )}
      {persisted === true && (
        <p className="mt-1 text-xs text-base-content/70">
          The browser has agreed to keep this data until you delete it.
        </p>
      )}
    </div>
  );
}
