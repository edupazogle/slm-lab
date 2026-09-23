// Markdown for model output: react-markdown with GFM tables and highlighted code. Raw HTML is skipped rather than
// sanitised (nothing from the model reaches innerHTML), and a link is only rendered as a link when it is http(s) or
// mailto, so a model cannot emit a javascript: URL for someone to click.
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

function safeHref(href?: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, window.location.href);
    return ALLOWED_PROTOCOLS.includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const components: Components = {
  a({ href, children, ...props }) {
    const safe = safeHref(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
