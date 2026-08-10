export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface AppUpdateInfo {
  version: string;
  releaseUrl: string;
  releaseDate: string | null;
  releaseNotes: string | null;
  downloadSize: number | null;
  mandatory: boolean;
  minSupportedVersion: string | null;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateSettings {
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  skippedVersion: string | null;
  lastCheckedAt: string | null;
}

export interface UpdateInstallResult {
  status: "ready" | "blocked";
  runningServers?: Array<{ id: string; name: string }>;
}

export interface UpdateCheckResult {
  status: UpdateStatus;
  info: AppUpdateInfo | null;
}

export interface UpdateErrorPayload {
  message: string;
  technicalDetails: string | null;
}
