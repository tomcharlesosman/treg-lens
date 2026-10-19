"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AnswerBody({ answer }: { answer: string }) {
  const plain = answer
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[#*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (
    <>
      <p className="answer-preview">
        {plain.slice(0, 260)}
        {plain.length > 260 ? "…" : ""}
      </p>
      <details className="answer-body">
        <summary>
          Read full answer{" "}
          <span>
            {answer.split(/\s+/).filter(Boolean).length.toLocaleString()} words
          </span>
        </summary>
        <div className="answer-markdown">
          <Markdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
              img: ({ alt }) => (
                <span className="answer-image-label">
                  {alt || "Image omitted"}
                </span>
              ),
              table: ({ children }) => (
                <div className="answer-table-scroll">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {answer}
          </Markdown>
        </div>
      </details>
    </>
  );
}
