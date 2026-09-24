SUMMARY_SYSTEM_PROMPT = (
    "你是一名课程内容整理助手。所有内容必须忠实于给定字幕,不得虚构字幕中没有的知识点。"
    "输出使用简体中文。"
)

QUIZ_SYSTEM_PROMPT = (
    "你是一名课程出题助手。所有题目必须严格基于给定字幕内容,不得虚构。"
    "输出使用简体中文。"
)


def chapter_summary_messages(chapter_title: str, transcript_text: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"以下是章节《{chapter_title}》的带时间戳字幕([mm:ss] 前缀)。请生成章节学习摘要。\n\n"
                "输出一个 JSON 对象,字段如下:\n"
                '- "summary_md": Markdown 格式的章节摘要,3-6 个自然段,概括核心内容;\n'
                '- "outline": 大纲数组,元素为 {"title": 小节标题, "start_mmss": 该小节开始时间, 如 "02:35"},按时间顺序;\n'
                '- "key_points": 知识点数组,元素为字符串,5-15 条,每条一句话。\n\n'
                f"字幕内容:\n{transcript_text}"
            ),
        },
    ]


def chunk_key_points_messages(chapter_title: str, chunk_text: str, chunk_index: int, chunk_total: int) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"以下是章节《{chapter_title}》字幕的第 {chunk_index}/{chunk_total} 段。请提取这一段的知识点。\n\n"
                '输出一个 JSON 对象:{"key_points": [知识点字符串, ...]},5-10 条,每条一句话,保留重要时间点(如 [02:35])。\n\n'
                f"字幕片段:\n{chunk_text}"
            ),
        },
    ]


def chapter_summary_from_points_messages(chapter_title: str, key_points_text: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"以下是长章节《{chapter_title}》各字幕分段提取出的知识点清单。请据此生成整章学习摘要。\n\n"
                "输出一个 JSON 对象,字段如下:\n"
                '- "summary_md": Markdown 格式的章节摘要,3-6 个自然段;\n'
                '- "outline": 大纲数组,元素为 {"title": 小节标题, "start_mmss": 开始时间, 如 "02:35"},按时间顺序;\n'
                '- "key_points": 知识点数组,元素为字符串,8-15 条,去重合并。\n\n'
                f"知识点清单:\n{key_points_text}"
            ),
        },
    ]


def course_summary_messages(course_title: str, chapter_summaries_text: str, skipped_titles: list[str]) -> list[dict[str, str]]:
    skipped_note = ""
    if skipped_titles:
        skipped_note = "\n\n注意:以下章节暂无摘要,未参与聚合:" + "、".join(skipped_titles)
    return [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"以下是课程《{course_title}》各章节的摘要。请聚合成课程级学习摘要。\n\n"
                "输出一个 JSON 对象,字段如下:\n"
                '- "summary_md": Markdown 格式的课程总览,2-5 个自然段;\n'
                '- "outline": 大纲数组,元素为 {"title": 章节或主题标题, "start_mmss": ""},按课程顺序;\n'
                '- "key_points": 全课程核心知识点数组,元素为字符串,10-20 条。\n\n'
                f"章节摘要:\n{chapter_summaries_text}{skipped_note}"
            ),
        },
    ]


def quiz_messages(chapter_title: str, transcript_text: str, count: int, types: list[str]) -> list[dict[str, str]]:
    type_desc = []
    if "choice" in types:
        type_desc.append('选择题(question_type="choice",options 固定 4 个选项,answer 为正确选项原文)')
    if "truefalse" in types:
        type_desc.append('判断题(question_type="truefalse",options 固定为 ["正确","错误"],answer 为 "正确" 或 "错误")')
    return [
        {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"请根据章节《{chapter_title}》的字幕出 {count} 道题,题型包括:{';'.join(type_desc)}。\n\n"
                "输出一个 JSON 数组,每个元素为:\n"
                '{"question_type": "choice" 或 "truefalse", "question": 题干, "options": [选项...], '
                '"answer": 正确答案, "explanation": 一句话解析}\n\n'
                f"字幕内容:\n{transcript_text}"
            ),
        },
    ]


QA_SYSTEM_PROMPT = (
    "你是一名课程内容助教。只能依据提供的课程字幕/摘要内容回答问题,禁止编造字幕中没有的信息。"
    "回答使用简体中文、Markdown 格式;引用具体讲解处时用 [mm:ss] 标注时间点。"
    "如果提供的课程内容未覆盖该问题,明确回答“课程内容中未提及”,不要强行作答。"
)

QA_HISTORY_LIMIT = 6
QA_HISTORY_ITEM_MAX_CHARS = 500


def qa_messages(question: str, context_text: str, history: list[dict[str, str]] | None = None) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": QA_SYSTEM_PROMPT}]
    for item in (history or [])[-QA_HISTORY_LIMIT:]:
        messages.append({"role": item["role"], "content": item["content"][:QA_HISTORY_ITEM_MAX_CHARS]})
    messages.append(
        {
            "role": "user",
            "content": (
                f"以下是课程相关内容(字幕带 [mm:ss] 时间点,可能包含章节摘要):\n\n{context_text}\n\n"
                f"学生的问题:{question}"
            ),
        }
    )
    return messages


def flashcards_messages(chapter_title: str, transcript_text: str, count: int) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"请根据章节《{chapter_title}》的字幕制作 {count} 张问答记忆闪卡,覆盖核心概念与结论。\n\n"
                "输出一个 JSON 数组,每个元素为:\n"
                '{"front": 问题(简短), "back": 答案(一两句话)}\n\n'
                f"字幕内容:\n{transcript_text}"
            ),
        },
    ]


DIGEST_SYSTEM_PROMPT = (
    "你是一名学习督导助手。根据给定的学习数据统计和课程学习重点,用简体中文写一段鼓励性的学习总结,"
    "指出近期学习重点与下一步建议,150 字以内,只输出纯文本段落,不要输出标题或列表。"
)


def digest_messages(stats_text: str, key_points: list[str]) -> list[dict[str, str]]:
    points_text = "\n".join(f"- {point}" for point in key_points) or "(暂无)"
    return [
        {"role": "system", "content": DIGEST_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"以下是近期的学习数据统计:\n{stats_text}\n\n"
                f"近期涉及课程的学习重点:\n{points_text}\n\n"
                '请据此写一段"学习重点总结"。'
            ),
        },
    ]

OCR_PROMPT = (
    "这是一张课程视频的课件截图。请识别图中的所有文字,按阅读顺序原样输出为纯文本,"
    "保留标题和要点的换行结构;不要描述画面内容、不要添加评论;图中没有文字就输出空。"
)
