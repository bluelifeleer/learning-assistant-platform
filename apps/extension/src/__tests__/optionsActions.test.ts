import { describe, expect, it, vi } from "vitest";
import { saveConfigAndReportBinding } from "../optionsActions";

describe("options actions", () => {
  it("saves config and immediately reports a binding heartbeat", async () => {
    const saveConfig = vi.fn().mockResolvedValue(undefined);
    const reportHeartbeat = vi.fn().mockResolvedValue(undefined);
    const config = {
      apiBaseUrl: "http://127.0.0.1:17890/api/v1",
      apiToken: "lap_token",
      enabledAdapters: ["wencai-school"],
    };

    const result = await saveConfigAndReportBinding(config, { saveConfig, reportHeartbeat });

    expect(saveConfig).toHaveBeenCalledWith(config);
    expect(reportHeartbeat).toHaveBeenCalledWith(config);
    expect(result.status).toBe("online");
    expect(result.message).toBe("配置已保存，插件已完成绑定并上报在线");
  });
});
