export type AppErrorCategory =
  | "electron"
  | "renderer"
  | "ipc"
  | "server"
  | "java"
  | "download"
  | "file"
  | "config"
  | "template"
  | "plugin"
  | "update"
  | "network"
  | "auth"
  | "unknown";

export type AppErrorSeverity = "info" | "warning" | "error" | "critical";

export type AppErrorRecoveryAction =
  | "retry"
  | "open-settings"
  | "open-java-center"
  | "open-logs"
  | "copy-details"
  | "report-issue"
  | "dismiss";

export interface AppError {
  id: string;
  category: AppErrorCategory;
  severity: AppErrorSeverity;
  userMessage: string;
  technicalDetails: string | null;
  possibleSolution: string | null;
  timestamp: string;
  source: string;
  action: string;
  causeId?: string | null;
  recoveries: AppErrorRecoveryAction[];
}

export interface AppErrorEvent extends AppError {
  clearedAt: string | null;
}

export interface AppErrorCreateInput {
  category?: AppErrorCategory;
  severity?: AppErrorSeverity;
  userMessage: string;
  technicalDetails?: string | null;
  possibleSolution?: string | null;
  source?: string;
  action?: string;
  causeId?: string | null;
  recoveries?: AppErrorRecoveryAction[];
}

export interface ApiErrorResponse {
  error: AppError;
}

export interface ErrorHistoryResponse {
  errors: AppErrorEvent[];
}

export interface ErrorExportResponse {
  exportedAt: string;
  errors: AppErrorEvent[];
}
