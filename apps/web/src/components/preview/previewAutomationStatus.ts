import type { PreviewAutomationStatus, PreviewNavStatus } from "@t3tools/contracts";

/**
 * preview_status must not report a failed guest as a healthy automation target.
 * Keep the requested URL so Retry/navigate still have something useful; the
 * chrome-error interstitial is not a navigable address.
 *
 * When a live desktop status already says the guest is available or still
 * loading, keep it. A stale LoadFailed snapshot can lag a retry that is
 * attaching or already in flight.
 */
export function applyPreviewLoadFailureToAutomationStatus(
  status: PreviewAutomationStatus,
  navStatus: PreviewNavStatus | undefined,
  options?: { readonly preferLiveAvailability?: boolean },
): PreviewAutomationStatus {
  if (navStatus?._tag !== "LoadFailed") return status;
  if (options?.preferLiveAvailability && (status.available || status.loading)) return status;
  return {
    ...status,
    available: false,
    loading: false,
    url: navStatus.url,
    title: navStatus.description || status.title,
  };
}
