interface CourseDetailProps {
  title?: string;
  description?: string;
}

export function CourseDetail({ title = "课程详情", description = "章节树、字幕片段、播放时间线和笔记。" }: CourseDetailProps) {
  return <section className="panel"><h2>{title}</h2><p>{description}</p></section>;
}
