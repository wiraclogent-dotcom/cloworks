import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { slugifyHeading } from "@/lib/help/toc";

/** Plain text of a heading's children, so the id matches what extractToc() produces. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

/**
 * Renders a guide body. Raw HTML is intentionally NOT rendered: react-markdown escapes it, and no rehype-raw
 * plugin is enabled. Do not add one; guide bodies are not trusted markup.
 */
export function ArticleBody({ body }: { body: string }) {
  return (
    <Markdown
      components={{
        h2: ({ children }) => <h2 id={slugifyHeading(textOf(children))}>{children}</h2>,
        h3: ({ children }) => <h3 id={slugifyHeading(textOf(children))}>{children}</h3>,
      }}
    >
      {body}
    </Markdown>
  );
}
