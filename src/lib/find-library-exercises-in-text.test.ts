import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findLibraryExercisesInText,
  normalizeExerciseSearchText,
} from "./find-library-exercises-in-text";

const library = [
  { name: "Burpees", videoUrl: "https://youtube.com/watch?v=burpees1" },
  { name: "Row", videoUrl: "https://youtube.com/watch?v=row11111" },
  { name: "Wall Balls", videoUrl: "https://youtube.com/watch?v=wallballs" },
  { name: "Partner Run", videoUrl: "https://youtube.com/watch?v=prun1111" },
  { name: "Balls", videoUrl: "https://youtube.com/watch?v=balls111" },
  { name: "No Video", videoUrl: "" },
];

const wodText =
  "*podem dividir como quiserem desde que no final dê o mesmo número de reps para cada um Partner WOD Buy in: 1000m partner run 100 burpees 2000m row 100 wall balls @6/9kg 2000m row 100 burpees Sem reg";

describe("normalizeExerciseSearchText", () => {
  it("lowercases, strips accents, and turns symbols into spaces", () => {
    assert.equal(
      normalizeExerciseSearchText("100 wall balls @6/9kg"),
      "100 wall balls 6 9kg"
    );
    assert.equal(normalizeExerciseSearchText("Abdução"), "abducao");
  });
});

describe("findLibraryExercisesInText", () => {
  it("finds library exercises inside a Partner WOD block (any case)", () => {
    const matched = findLibraryExercisesInText(wodText, library);
    assert.deepEqual(
      matched.map((m) => m.name).sort(),
      ["Burpees", "Partner Run", "Row", "Wall Balls"].sort()
    );
  });

  it("prefers longer names over shorter overlapping ones", () => {
    const matched = findLibraryExercisesInText("100 wall balls @6/9kg", library);
    assert.deepEqual(
      matched.map((m) => m.name),
      ["Wall Balls"]
    );
  });

  it("does not match a short name inside a longer word token", () => {
    const matched = findLibraryExercisesInText("rowing machine", [
      { name: "Row", videoUrl: "https://youtube.com/watch?v=row11111" },
    ]);
    assert.equal(matched.length, 0);
  });

  it("skips library entries without a video URL", () => {
    const matched = findLibraryExercisesInText("do No Video today", library);
    assert.equal(matched.length, 0);
  });
});
