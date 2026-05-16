export type AIToolId = string;

export interface ProviderCapabilities {
  hasTokenMetrics: boolean;
  hasModelInfo: boolean;
  hasContextWindow: boolean;
  hasMultiSession: boolean;
}

export interface SessionInfo {
  id: string;
  title: string;
  startTime: number;
  lastActive: number;
  model?: string;
  isActive: boolean;
}

export interface ProviderMetrics {
  toolId: AIToolId;
  displayName: string;
  isActive: boolean;
  lastUpdated: number;

  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  contextWindowUsed?: number;
  contextWindowMax?: number;

  activityCount: number;
  sessionStartTime?: number;
  activeTimeMs: number;

  sessions?: SessionInfo[];
  activeSessionId?: string;
}

export interface AggregatedMetrics {
  providers: ProviderMetrics[];
  totalActivityCount: number;
  totalActiveTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  activeProviderCount: number;
  primaryProvider?: AIToolId;
}

export interface MetricsSnapshot {
  timestamp: number;
  date: string;
  hourOfDay: number;
  providers: {
    toolId: AIToolId;
    inputTokens: number;
    outputTokens: number;
    activityCount: number;
    activeTimeMs: number;
    model?: string;
  }[];
}

export interface DailySummary {
  date: string;
  providers: {
    toolId: AIToolId;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalActivityCount: number;
    totalActiveTimeMs: number;
  }[];
}

export interface HistoryStore {
  version: number;
  snapshots: MetricsSnapshot[];
  dailySummaries: DailySummary[];
}
