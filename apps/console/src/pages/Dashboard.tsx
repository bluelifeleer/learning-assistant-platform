import type { PluginClientStatus } from "../api/client";
import { PluginPanel } from "./PluginPanel";

interface DashboardProps {
  onPluginStatusChange?: (clients: PluginClientStatus[]) => void;
}

export function Dashboard({ onPluginStatusChange }: DashboardProps) {
  return (
    <section className="dashboard-grid">
      <PluginPanel onStatusChange={onPluginStatusChange} />
      <article>
        <h2>最近课程</h2>
        <p>课程采集后会显示在这里。</p>
      </article>
      <article>
        <h2>待处理提醒</h2>
        <p>视频结束后的手动保存提醒会显示在这里。</p>
      </article>
      <article>
        <h2>最近字幕</h2>
        <p>字幕片段会按课程和章节汇总。</p>
      </article>
      <article>
        <h2>导出状态</h2>
        <p>Markdown 和 JSON 导出任务会显示在这里。</p>
      </article>
    </section>
  );
}
