import { TaskDraft } from '@/types/chat';

const TASK_DRAFT_RE = /```task_draft\s*\n?([\s\S]*?)```/;
// Global strip: remove every fence, not just the first (model slip: two blocks).
const TASK_DRAFT_STRIP_RE = /```task_draft\s*\n?[\s\S]*?```/g;

// Pull the single ```task_draft fenced block out of an assistant message.
// Returns the parsed draft (or null) plus the content with the block removed,
// so the fence never reaches MarkdownRenderer. Malformed JSON leaves the
// content untouched and the card absent — no crash on model slip-ups.
export const extractTaskDraft = (
  content: string
): { draft: TaskDraft | null; content: string } => {
  if (!content) return { draft: null, content: content || '' };
  const match = content.match(TASK_DRAFT_RE);
  if (!match) {
    // Unterminated fence (stream glitch / model cut off): drop it from display.
    const stripped = content.replace(/\s*```task_draft\s*\n?[\s\S]*$/, '').trim();
    return { draft: null, content: stripped };
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<TaskDraft>;
    if (parsed && typeof parsed.title === 'string' && parsed.title.trim()) {
      const draft: TaskDraft = {
        title: parsed.title.trim(),
        description: typeof parsed.description === 'string' ? parsed.description : '',
        hours:
          typeof parsed.hours === 'number' && parsed.hours > 0 ? parsed.hours : 1,
      };
      return { draft, content: content.replace(TASK_DRAFT_STRIP_RE, '').trim() };
    }
  } catch {
    /* fall through: strip the broken fence anyway so raw markup never renders */
  }
  return { draft: null, content: content.replace(TASK_DRAFT_STRIP_RE, '').trim() };
};
