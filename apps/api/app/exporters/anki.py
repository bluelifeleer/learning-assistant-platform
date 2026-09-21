def escape_field(value: str | None) -> str:
    text = value or ""
    return text.replace("\t", " ").replace("\r\n", "<br>").replace("\n", "<br>").replace("\r", "<br>")


def render_anki_tsv(cards: list[dict]) -> str:
    lines = [f"{escape_field(card.get('front'))}\t{escape_field(card.get('back'))}" for card in cards]
    return "\n".join(lines) + ("\n" if lines else "")
