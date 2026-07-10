import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Server-side markdown renderer for repo-controlled content (changelog,
 * legal pages). react-markdown renders to React elements — no
 * dangerouslySetInnerHTML, so even a compromised markdown file cannot
 * inject script. Import from server components only: keeps the parser out
 * of the client bundle.
 */
export function Markdown({ source }: { source: string }): ReactNode {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
