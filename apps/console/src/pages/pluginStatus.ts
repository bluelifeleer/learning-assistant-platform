import type { PluginClientStatus } from "../api/client";

export type PluginBindingState = "online" | "offline" | "unbound";

export function getPluginBindingState(clients: PluginClientStatus[]): PluginBindingState {
  if (clients.some((client) => client.online)) return "online";
  if (clients.length > 0) return "offline";
  return "unbound";
}

export function formatPluginBindingState(state: PluginBindingState): string {
  if (state === "online") return "在线";
  if (state === "offline") return "离线";
  return "待绑定";
}
