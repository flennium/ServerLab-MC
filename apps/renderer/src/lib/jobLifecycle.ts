import type {
  JavaInstallStatus,
  SoftwareDownloadStatus,
} from "@serverlab/shared";

export type JobStatus = JavaInstallStatus | SoftwareDownloadStatus;

export function isTerminalJobStatus(status: JobStatus): boolean {
  return (
    status === "completed" ||
    status === "cached" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function isSuccessfulJobStatus(status: JobStatus): boolean {
  return status === "completed" || status === "cached";
}

export function shouldKeepJobProgress(status: JobStatus): boolean {
  return !isSuccessfulJobStatus(status);
}

export function getTerminalJobMessage(status: JobStatus, label: string): string {
  if (status === "cached") return `${label} is already cached.`;
  if (status === "completed") return `${label} installed.`;
  if (status === "cancelled") return `${label} cancelled.`;
  return `${label} failed.`;
}
