import assert from "node:assert/strict";
import test from "node:test";
import { editCompetitor, inferQuestionIntent, onboardingWebsite, starterQuestionIndexes } from "./onboarding-review";

test("starter selection balances buyer intents and excludes duplicate or blank questions", () => {
  const questions = [
    { text: "Which tool is best?", intent: "category" as const },
    { text: "Which other tool is best?", intent: "category" as const },
    { text: "How does Acme compare?", intent: "comparison" as const },
    { text: "How can teams automate?", intent: "use-case" as const },
    { text: " WHICH TOOL IS BEST? ", intent: "purchase" as const },
    { text: "", intent: "other" as const },
  ];
  assert.deepEqual(starterQuestionIndexes(questions), [0, 2, 3]);
  assert.deepEqual(starterQuestionIndexes(questions.slice(4)), [0]);
  assert.deepEqual(starterQuestionIndexes([{ text: "", intent: "category" }]), []);
});

test("a competitor name correction keeps its domain and invalidates the old rationale", () => {
  const original = { name: "Acem", domain: "acme.com", reason: "Research rationale", sourceUrl: "https://acme.com/about", id: "row1" };
  assert.deepEqual(editCompetitor(original, { name: "Acme" }), { name: "Acme", domain: "acme.com", id: "row1" });
  assert.equal(original.reason, "Research rationale");
  assert.deepEqual(editCompetitor(original, { domain: "newacme.com" }), { name: "Acem", domain: "newacme.com", id: "row1" });
});

test("legacy generated questions receive editable intent suggestions", () => {
  assert.equal(inferQuestionIntent("Best alternatives to Acme", "Acme"), "comparison");
  assert.equal(inferQuestionIntent("What does Acme cost?", "Acme"), "purchase");
  assert.equal(inferQuestionIntent("What is Acme?", "Acme"), "branded");
  assert.equal(inferQuestionIntent("How can teams automate reports?"), "use-case");
  assert.equal(inferQuestionIntent("Which platforms exist?"), "category");
});

test("website feedback accepts a domain, removes tracking, and rejects malformed or private destinations", () => {
  assert.deepEqual(onboardingWebsite(" www.acme.com/product?email=private#top "), { url: "https://www.acme.com/product", domain: "acme.com" });
  for (const value of ["not a website", "localhost", "127.0.0.1", "https://a:b@acme.com", "https://acme.local", "https://acme.com:8080", "https://acme.com/%0a"]) {
    assert.throws(() => onboardingWebsite(value));
  }
});
