export type Danmaku = {
  id: string;
  time: number;
  text: string;
  viewer: string;
  color: string;
  demo?: boolean;
};

export type CustomViewer = {
  id: string;
  name: string;
  personality: string;
  focus: string;
  background: string;
  bannedWords: string;
  extraPrompt: string;
  weight: number;
};

export type ShipRule = { id: string; left: string; right: string; mode: "fixed" | "reversible" };

export type AudienceConfig = {
  languages: string[];
  identities: Record<string, number>;
  tones: Record<string, number>;
  customViewers: CustomViewer[];
  interaction: boolean;
  memorySize: number;
  globalBannedWords: string;
  extraPrompt: string;
  /** Optional local world book. Only relevant short lines are sent to AI. */
  worldBook?: string;
  /** Imported structured world books are stored privately on this device. */
  worldBookEntries?: import("./worldbook-import").ImportedWorldEntry[];
  /** Custom viewer speech styles: one style per line, may include examples. */
  customTones?: string;
  /** Direction-aware ship rules; order is meaningful only for fixed mode. */
  shipRules?: ShipRule[];
  /** Explicitly allowed CP pairings, separated by newline or commas. */
  shipPairs?: string;
  /** Pairings users do not want mentioned. */
  blockedPairs?: string;
  /** Neutral viewing-scene guidance from a built-in preset (game, anime, documentary…). */
  sceneHint?: string;
};

export type ProviderKind = "openai" | "gemini";

export type ProviderConfig = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  jsonMode: boolean;
  imageDetail: "low" | "auto" | "high";
  geminiInput: "frames" | "video";
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  transcribeBaseUrl: string;
  transcribeModel: string;
  transcribeUseMainKey: boolean;
};

export type AnalysisConfig = {
  frameInterval: number;
  segmentLength: number;
  frameMaxWidth: number;
  jpegQuality: number;
};

export type GenerationConfig = {
  density: number;
  totalLimit: number | null;
  noSpoiler: boolean;
  bufferMode: "full" | "live";
  lookahead: number;
  maxRetries: number;
  /** Maximum number of successful/attempted segments in one generation run. */
  requestLimit?: number | null;
};

export type DisplayConfig = {
  enabled: boolean;
  crossSeconds: number;
  /** Playback-only correction. Negative values show danmaku earlier. */
  timeOffset?: number;
  fontSize: number;
  opacity: number;
  displayDensity: number;
  area: number;
  showViewer: boolean;
};

export type Settings = {
  provider: ProviderConfig;
  analysis: AnalysisConfig;
  generation: GenerationConfig;
  audience: AudienceConfig;
  display: DisplayConfig;
};

export type Cue = { start: number; end: number; text: string };

export type SourceKind = "none" | "file" | "url" | "youtube" | "bilibili";

export type VideoSource = {
  kind: SourceKind;
  src: string;
  label: string;
  file?: File;
  crossOrigin: boolean;
  analyzable: boolean;
  note?: string;
  youtubeId?: string;
  bilibiliEmbed?: string;
};

export type SegmentStatus = "pending" | "running" | "done" | "error" | "skipped" | "cancelled";

export type Segment = {
  index: number;
  start: number;
  end: number;
  status: SegmentStatus;
  attempts: number;
  count: number;
  error?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
};

export type HistorySession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceUrl?: string | undefined;
  duration: number;
  demo: boolean;
  model?: string | undefined;
  danmaku: Danmaku[];
  settings: Omit<Settings, "display">;
};

export type ViewerPreset = {
  id: string;
  name: string;
  createdAt: number;
  audience: AudienceConfig;
};

/** Simulated comments created locally or by the configured AI, never real public posts. */
export type TheaterComment = {
  id: string;
  name: string;
  text: string;
  liked: boolean;
  likes: number;
  replyTo?: string;
};

/** Private on-device collection; local File stays in IndexedDB, not on CoWatch servers. */
export type SavedScreening = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourceKind: Exclude<SourceKind, "none">;
  sourceLabel: string;
  /** Original user-selected video, stored only on this browser/device. */
  file?: File;
  sourceUrl?: string;
  thumbnail?: string;
  duration: number;
  danmaku: Danmaku[];
  demo: boolean;
  cues: Cue[];
  cueLabel: string;
  comments: TheaterComment[];
};
