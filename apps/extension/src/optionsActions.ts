import { saveExtensionConfig, type ExtensionConfig } from "./config";
import { reportOptionsHeartbeat } from "./pluginHeartbeat";

export type OptionsBindingStatus = "saved" | "online" | "offline";

export interface OptionsBindingResult {
  status: OptionsBindingStatus;
  message: string;
}

interface OptionsActionDeps {
  saveConfig?: (config: ExtensionConfig) => Promise<void>;
  reportHeartbeat?: (config: ExtensionConfig) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "连接失败";
}

export async function saveConfigAndReportBinding(config: ExtensionConfig, deps: OptionsActionDeps = {}): Promise<OptionsBindingResult> {
  const saveConfig = deps.saveConfig ?? saveExtensionConfig;
  const reportHeartbeat = deps.reportHeartbeat ?? reportOptionsHeartbeat;

  await saveConfig(config);
  if (!config.apiToken.trim()) {
    return { status: "saved", message: "配置已保存，请填写插件 Token 后再绑定" };
  }

  try {
    await reportHeartbeat(config);
    return { status: "online", message: "配置已保存，插件已完成绑定并上报在线" };
  } catch (error: unknown) {
    return { status: "offline", message: `配置已保存，但连接失败: ${errorMessage(error)}` };
  }
}
