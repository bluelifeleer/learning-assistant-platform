import { useEffect, useState } from "react";
import { fetchAdapters, type AdapterItem } from "../api/client";

export function Adapters() {
  const [items, setItems] = useState<AdapterItem[]>([]);
  const [message, setMessage] = useState("正在读取适配器...");

  useEffect(() => {
    void fetchAdapters()
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length ? "" : "暂无站点适配器记录，采集课程后会自动创建。");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "适配器读取失败"));
  }, []);

  return (
    <section className="panel">
      <h2>站点适配器</h2>
      {message ? <p>{message}</p> : null}
      <div className="data-table">
        <div><strong>名称</strong><strong>Adapter</strong><strong>状态</strong></div>
        {items.map((item) => (
          <div key={item.id}><span>{item.name}</span><span>{item.adapter_id}</span><span>{item.status}</span></div>
        ))}
      </div>
    </section>
  );
}
