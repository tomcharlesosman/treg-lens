import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizedCron } from "./cron-auth";

test("cron requires an exact independent configured bearer secret", () => {
  const secret = "cron-only-secret-".repeat(4);
  assert.equal(authorizedCron(`Bearer ${secret}`, secret), true);
  for (const header of [null, "", secret, `bearer ${secret}`, `Bearer ${secret} `, "Bearer different-secret"])
    assert.equal(authorizedCron(header, secret), false);
  for (const missing of [undefined, "", "short"])
    assert.equal(authorizedCron("Bearer undefined", missing), false);
});
