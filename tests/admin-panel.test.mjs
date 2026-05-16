import assert from "node:assert/strict";
import test from "node:test";

import { maskId, maskToken } from "../src/lib/admin-safety.ts";

test("maskToken never returns the full share token", () => {
  const token = "abc123456789xyz";

  assert.equal(maskToken(token), "abc123...xyz");
  assert.notEqual(maskToken(token), token);
});

test("maskId shortens long identifiers for audit output", () => {
  const id = "clwadminaudit123456789";

  assert.equal(maskId(id), "clwadm...6789");
  assert.notEqual(maskId(id), id);
});
