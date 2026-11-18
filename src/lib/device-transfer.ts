import { db } from "./db";
import { useApp } from "./store";
import { defaultSettings } from "./constants";
import type { HistorySession, SavedScreening, Settings, ViewerPreset } from "./types";

const FORMAT = "cowatch-device-transfer";
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
type PortableScreening = Omit<SavedScreening, "file">;
type DeviceTransfer = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: number;
  settings: Settings;
  history: HistorySession[];
  presets: ViewerPreset[];
  screenings: PortableScreening[];
};

function stripCredentials(settings: Settings): Settings {
  // Never export passwords, API keys, or third-party service endpoints.
  const defaults = defaultSettings().provider;
  return {
    ...settings,
    provider: {
      ...settings.provider,
      baseUrl: defaults.baseUrl,
      transcribeBaseUrl: defaults.transcribeBaseUrl,
    },
  };
}

export async function exportDeviceTransfer(): Promise<{text: string; screenings: number; history: number; presets: number; missingVideos: number}> {
  const [history, presets, screenings] = await Promise.all([
    db.listHistory(), db.listPresets(), db.listScreenings(),
  ]);
  const payload: DeviceTransfer = {
    format: FORMAT,
    version: 1,
    exportedAt: Date.now(),
    settings: stripCredentials(useApp.getState().settings),
    history: history.map(row => ({...row, settings: stripCredentials({...defaultSettings(), ...row.settings, display: defaultSettings().display})})),
    presets,
    screenings: screenings.map(({file: _file, thumbnail: _thumbnail, ...screening}) => screening),
  };
  return {
    text: JSON.stringify(payload),
    screenings: screenings.length,
    history: history.length,
    presets: presets.length,
    missingVideos: screenings.filter(s => s.sourceKind === "file").length,
  };
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error(label + "格式不正确或条目过多");
  if (value.some(v => !v || typeof v !== "object" || Array.isArray(v))) throw new Error(label + "包含无效条目");
  return value as Record<string, unknown>[];
}
function validate(input: unknown): DeviceTransfer {
  if (!input || typeof input !== "object") throw new Error("文件不是共映设备迁移包");
  const value = input as Record<string, unknown>;
  if (value.format !== FORMAT || value.version !== 1) throw new Error("设备迁移包格式或版本不兼容");
  if (!value.settings || typeof value.settings !== "object" || Array.isArray(value.settings)) throw new Error("缺少设置");
  const history = objectArray(value.history, "生成历史");
  const presets = objectArray(value.presets, "观众预设");
  const screenings = objectArray(value.screenings, "放映收藏");
  for (const item of [...history, ...presets, ...screenings]) {
    if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 150) throw new Error("存在无效记录编号");
  }
  for (const item of history) {
    if (!Array.isArray(item.danmaku) || !item.settings || typeof item.title !== "string") throw new Error("生成历史记录不完整");
  }
  for (const item of presets) {
    if (!item.audience || typeof item.name !== "string") throw new Error("观众预设不完整");
  }
  for (const item of screenings) {
    if (!Array.isArray(item.danmaku) || !Array.isArray(item.cues) || !Array.isArray(item.comments)
      || typeof item.title !== "string" || !["file","url","youtube","bilibili"].includes(String(item.sourceKind)))
      throw new Error("收藏记录不完整");
    if ("file" in item) throw new Error("迁移包不能包含嵌入的视频文件");
  }
  return value as DeviceTransfer;
}

export async function importDeviceTransfer(file: File): Promise<{history: number; presets: number; screenings: number; missingVideos: number}> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("迁移包超过 15MB；请检查是否使用了正确的 JSON 文件");
  const incoming = validate(JSON.parse(await file.text()) as unknown);
  // Merge records without deleting local data. On ID collision retain the
  // newer record, and always preserve an existing local video File object.
  const [oldHistory, oldPresets, oldScreenings] = await Promise.all([
    db.listHistory(), db.listPresets(), db.listScreenings(),
  ]);
  const histories = new Map(oldHistory.map(x => [x.id, x]));
  const presets = new Map(oldPresets.map(x => [x.id, x]));
  const screenings = new Map(oldScreenings.map(x => [x.id, x]));
  let historiesAdded = 0, presetsAdded = 0, screeningsAdded = 0;
  for (const row of incoming.history) {
    const old = histories.get(row.id);
    if (!old || row.updatedAt > old.updatedAt) {
      await db.putHistory({...row, settings: stripCredentials({...defaultSettings(), ...row.settings, display: defaultSettings().display})});
      historiesAdded++;
    }
  }
  for (const row of incoming.presets) {
    if (!presets.has(row.id)) {await db.putPreset(row); presetsAdded++;}
  }
  for (const row of incoming.screenings) {
    const old = screenings.get(row.id);
    if (!old || row.updatedAt > old.updatedAt) {
      await db.putScreening({...row, ...(old?.file ? {file: old.file} : {})});
      screeningsAdded++;
    }
  }
  // Preserve current provider credentials/endpoints. Import appearance,
  // audience, analysis and generation preferences without overwriting keys.
  const current = useApp.getState().settings;
  const imported = incoming.settings;
  useApp.getState().setSettings({
    ...current,
    audience: {...current.audience, ...imported.audience},
    analysis: {...current.analysis, ...imported.analysis},
    generation: {...current.generation, ...imported.generation},
    display: {...current.display, ...imported.display},
    provider: {...current.provider, kind: imported.provider.kind, model: imported.provider.model,
      imageDetail: imported.provider.imageDetail, jsonMode: imported.provider.jsonMode,
      geminiInput: imported.provider.geminiInput},
  });
  const finalScreenings = await db.listScreenings();
  window.dispatchEvent(new Event("cowatch:records-updated"));
  return {
    history: historiesAdded,
    presets: presetsAdded,
    screenings: screeningsAdded,
    missingVideos: finalScreenings.filter(s => s.sourceKind === "file" && !s.file).length,
  };
}
