import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectShopRegistrationStudentIds } from "./fetch-shop-registrations";

describe("fetch-shop-registrations", () => {
  it("collectShopRegistrationStudentIds merges auth uid and roster doc id", () => {
    const ids = collectShopRegistrationStudentIds(
      ["authUid123"],
      ["rosterDoc456"],
      ["authUid123"],
      ["authUid789"]
    );
    assert.deepEqual(new Set(ids), new Set(["authUid123", "rosterDoc456", "authUid789"]));
  });

  it("collectShopRegistrationStudentIds dedupes empty values", () => {
    const ids = collectShopRegistrationStudentIds(["same"], ["same"], [""], [undefined as unknown as string]);
    assert.deepEqual(ids, ["same"]);
  });
});
