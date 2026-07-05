interface SettingsProps {
  title?: string;
  description?: string;
}

export function Settings({ title = "站点适配器", description = "查看内置 adapter、启用状态和匹配域名。" }: SettingsProps) {
  return <section className="panel"><h2>{title}</h2><p>{description}</p></section>;
}
