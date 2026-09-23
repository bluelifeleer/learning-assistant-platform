import re
from dataclasses import dataclass

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entities import Chapter, ChapterSummary, Organization, TranscriptSegment
from app.schemas.ai import AskAnswerOut, AskCitation, AskRequestIn
from app.services import ai_prompts, llm
from app.services.ai_pipeline import format_mmss

MAX_TERMS = 12
TOP_SEGMENTS = 12
MAX_CITATIONS = 5
NEIGHBORHOOD_SECONDS = 30
CONTEXT_MAX_CHARS = 6000
EXCERPT_MAX_CHARS = 120
FALLBACK_SEGMENTS_PER_CHAPTER = 5

_CJK_RE = re.compile(r"[一-鿿]+")
_LATIN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.+-]*")
_STOP_CHARS = set("的了是在和有我你他她它们这那也不都就很还又或及与吗呢吧啊哦嗯么什怎为于把被让向从到对")


@dataclass
class CitationSegment:
    chapter_id: str
    chapter_title: str
    start_seconds: float | None
    text: str
    score: int


def extract_terms(question: str) -> list[str]:
    terms: list[str] = []
    for match in _LATIN_RE.finditer(question):
        term = match.group(0).lower()
        if len(term) >= 2:
            terms.append(term)
    for match in _CJK_RE.finditer(question):
        run = match.group(0)
        if len(run) == 1:
            if run not in _STOP_CHARS:
                terms.append(run)
            continue
        for index in range(len(run) - 1):
            terms.append(run[index : index + 2])
    seen: set[str] = set()
    result: list[str] = []
    for term in terms:
        if term not in seen:
            seen.add(term)
            result.append(term)
        if len(result) >= MAX_TERMS:
            break
    return result


def _like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _scoped_chapters(db: Session, course_id: str, chapter_id: str | None) -> list[Chapter]:
    query = db.query(Chapter).filter(Chapter.course_id == course_id)
    if chapter_id:
        query = query.filter(Chapter.id == chapter_id)
    return query.order_by(Chapter.sort_order.asc()).all()


def _format_segment_line(segment: TranscriptSegment) -> str:
    if segment.start_seconds is not None:
        return f"[{format_mmss(segment.start_seconds)}] {segment.text}"
    return segment.text


def _chapter_sort_key(chapter_map: dict[str, Chapter], segment: TranscriptSegment) -> tuple[int, float]:
    chapter = chapter_map.get(segment.chapter_id)
    sort_order = chapter.sort_order if chapter else 0
    return (sort_order, float(segment.start_seconds) if segment.start_seconds is not None else 0.0)


def _build_context(db: Session, chapter_map: dict[str, Chapter], hit_segments: list[TranscriptSegment]) -> str:
    selected: dict[str, TranscriptSegment] = {}
    for segment in hit_segments:
        selected[segment.id] = segment
        if segment.start_seconds is None:
            continue
        neighbors = (
            db.query(TranscriptSegment)
            .filter(
                TranscriptSegment.chapter_id == segment.chapter_id,
                TranscriptSegment.start_seconds.isnot(None),
                TranscriptSegment.start_seconds >= segment.start_seconds - NEIGHBORHOOD_SECONDS,
                TranscriptSegment.start_seconds <= segment.start_seconds + NEIGHBORHOOD_SECONDS,
            )
            .all()
        )
        for neighbor in neighbors:
            selected.setdefault(neighbor.id, neighbor)
    ordered = sorted(selected.values(), key=lambda item: _chapter_sort_key(chapter_map, item))

    lines: list[str] = []
    total = 0
    current_chapter_id: str | None = None
    for segment in ordered:
        chapter = chapter_map.get(segment.chapter_id)
        if chapter and chapter.id != current_chapter_id:
            current_chapter_id = chapter.id
            header = f"### 章节:{chapter.title}"
            if total + len(header) > CONTEXT_MAX_CHARS:
                break
            lines.append(header)
            total += len(header) + 1
        line = _format_segment_line(segment)
        if total + len(line) > CONTEXT_MAX_CHARS:
            break
        lines.append(line)
        total += len(line) + 1
    return "\n".join(lines)


def _fallback_context(db: Session, chapters: list[Chapter]) -> str:
    lines: list[str] = []
    total = 0
    for chapter in chapters:
        segments = (
            db.query(TranscriptSegment)
            .filter(TranscriptSegment.chapter_id == chapter.id)
            .order_by(TranscriptSegment.start_seconds.asc())
            .limit(FALLBACK_SEGMENTS_PER_CHAPTER)
            .all()
        )
        summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).first()
        if not segments and not summary:
            continue
        header = f"### 章节:{chapter.title}"
        if total + len(header) > CONTEXT_MAX_CHARS:
            break
        lines.append(header)
        total += len(header) + 1
        if summary:
            summary_line = f"章节摘要:{summary.summary_md}"
            if total + len(summary_line) > CONTEXT_MAX_CHARS:
                summary_line = summary_line[: max(CONTEXT_MAX_CHARS - total, 0)]
            lines.append(summary_line)
            total += len(summary_line) + 1
        for segment in segments:
            line = _format_segment_line(segment)
            if total + len(line) > CONTEXT_MAX_CHARS:
                break
            lines.append(line)
            total += len(line) + 1
    return "\n".join(lines)


def retrieve_segments(db: Session, course_id: str, chapter_id: str | None, question: str) -> tuple[str, list[CitationSegment]]:
    chapters = _scoped_chapters(db, course_id, chapter_id)
    chapter_map = {chapter.id: chapter for chapter in chapters}
    terms = extract_terms(question)

    hits: list[tuple[TranscriptSegment, int]] = []
    if terms:
        query = db.query(TranscriptSegment).filter(TranscriptSegment.course_id == course_id)
        if chapter_id:
            query = query.filter(TranscriptSegment.chapter_id == chapter_id)
        conditions = [TranscriptSegment.text.ilike(_like_pattern(term), escape="\\") for term in terms]
        for segment in query.filter(or_(*conditions)).all():
            lowered = segment.text.lower()
            score = sum(1 for term in terms if term in lowered)
            if score:
                hits.append((segment, score))
        hits.sort(key=lambda item: (-item[1], float(item[0].start_seconds) if item[0].start_seconds is not None else 0.0))
        hits = hits[:TOP_SEGMENTS]

    if not hits:
        return _fallback_context(db, chapters), []

    context_text = _build_context(db, chapter_map, [segment for segment, _ in hits])
    citations = [
        CitationSegment(
            chapter_id=segment.chapter_id,
            chapter_title=chapter_map[segment.chapter_id].title if segment.chapter_id in chapter_map else "",
            start_seconds=float(segment.start_seconds) if segment.start_seconds is not None else None,
            text=segment.text,
            score=score,
        )
        for segment, score in hits[:MAX_CITATIONS]
    ]
    return context_text, citations


def answer_question(db: Session, organization: Organization, payload: AskRequestIn) -> AskAnswerOut:
    context_text, citation_segments = retrieve_segments(db, payload.course_id, payload.chapter_id, payload.question)
    config = llm.llm_config_for_organization(organization)
    history = [{"role": item.role, "content": item.content} for item in payload.history]
    messages = ai_prompts.qa_messages(payload.question, context_text, history)
    answer_md = llm.chat_completion(config, messages, json_mode=False)
    return AskAnswerOut(
        answer_md=answer_md.strip(),
        citations=[
            AskCitation(
                chapter_id=segment.chapter_id,
                chapter_title=segment.chapter_title,
                start_seconds=segment.start_seconds,
                excerpt=segment.text[:EXCERPT_MAX_CHARS],
            )
            for segment in citation_segments
        ],
    )
