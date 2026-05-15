import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  programDisplayNameForSequenceId,
  reconcileSequenceProgramIds,
} from "./default-student-sequence";

describe("reconcileSequenceProgramIds", () => {
  it("keeps ids that still exist in the library", () => {
    const programs = [
      { id: "a1", name: "Treino A" },
      { id: "b2", name: "Treino B - Legs & Glutes" },
    ];
    assert.deepEqual(
      reconcileSequenceProgramIds(["a1", "b2"], ["Treino A", "Treino B - Legs & Glutes"], programs),
      ["a1", "b2"]
    );
  });

  it("maps stale ids to current library ids by saved name", () => {
    const programs = [{ id: "new-b", name: "Treino B - Legs & Glutes" }];
    assert.deepEqual(
      reconcileSequenceProgramIds(
        ["KYIlcSLx89LoGvmr5V2P"],
        ["Treino B - Legs & Glutes"],
        programs
      ),
      ["new-b"]
    );
  });
});

describe("programDisplayNameForSequenceId", () => {
  const programs = [{ id: "new-b", name: "Treino B - Legs & Glutes" }];

  it("returns the library name when the id matches", () => {
    assert.equal(programDisplayNameForSequenceId("new-b", 0, programs), "Treino B - Legs & Glutes");
  });

  it("falls back to saved names when the id is stale", () => {
    assert.equal(
      programDisplayNameForSequenceId(
        "KYIlcSLx89LoGvmr5V2P",
        0,
        programs,
        ["Treino B - Legs & Glutes"]
      ),
      "Treino B - Legs & Glutes"
    );
  });
});
