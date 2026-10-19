import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AnswerBody from "../components/answer-body";
test("untrusted answers render useful markdown without HTML execution or remote images", () => {
  const html = renderToStaticMarkup(
    createElement(AnswerBody, {
      answer:
        "# Hello\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![tracker](https://example.com/tracker.png)\n\n| Tool | Fit |\n| --- | --- |\n| Treg | APIs |\n\n[Source](https://example.com/docs)",
    }),
  );
  assert.ok(html.includes("<h1>Hello</h1>"));
  assert.ok(html.includes("<table>"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('href="https://example.com/docs"'));
  assert.ok(html.includes('rel="noreferrer"'));
});
