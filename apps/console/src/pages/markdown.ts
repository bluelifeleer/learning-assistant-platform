function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(escaped: string): string {
  return escaped
    .replace(/!\[([^\]]*)\]\(note-image:([A-Za-z0-9-]+)\)/g, '<img data-note-image-id="$2" alt="$1" />')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function renderMarkdown(source: string): string {
  const html: string[] = [];
  let listOpen = false;
  let quoteOpen = false;

  function closeBlocks() {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
    if (quoteOpen) {
      html.push("</blockquote>");
      quoteOpen = false;
    }
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      closeBlocks();
      continue;
    }
    if (line.startsWith("## ")) {
      closeBlocks();
      html.push(`<h2>${renderInline(escapeHtml(line.slice(3)))}</h2>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!listOpen) {
        closeBlocks();
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${renderInline(escapeHtml(line.slice(2)))}</li>`);
      continue;
    }
    if (line.startsWith("> ")) {
      if (!quoteOpen) {
        closeBlocks();
        html.push("<blockquote>");
        quoteOpen = true;
      }
      html.push(`<p>${renderInline(escapeHtml(line.slice(2)))}</p>`);
      continue;
    }
    closeBlocks();
    html.push(`<p>${renderInline(escapeHtml(line))}</p>`);
  }

  closeBlocks();
  return html.join("");
}
