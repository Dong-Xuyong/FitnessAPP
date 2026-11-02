import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findRosterStudentByMemberNumber,
  firstMemberNumber,
  memberNumberKey,
  memberNumberMatchesQuery,
  memberNumberTakenWarning,
  memberNumbersEqual,
  normalizeMemberNumber,
} from "./member-number";

const roster = [
  { id: "ana", name: "Ana Costa", memberNumber: "0042", userId: "auth-ana" },
  { id: "bruno", firstName: "Bruno", lastName: "Silva", memberNumber: "  ab-7 ", userId: "auth-bruno" },
  { id: "carla", name: "Carla Dias", memberNumber: "", userId: "auth-carla" },
  { id: "duarte", name: "Duarte Reis", userId: "auth-duarte" },
];

describe("normalizeMemberNumber", () => {
  it("trims whitespace and keeps leading zeros", () => {
    assert.equal(normalizeMemberNumber("  0042  "), "0042");
    assert.equal(normalizeMemberNumber("0042"), "0042");
  });

  it("treats blank and non-strings as no number", () => {
    assert.equal(normalizeMemberNumber("   "), "");
    assert.equal(normalizeMemberNumber(null), "");
    assert.equal(normalizeMemberNumber(42), "");
    assert.equal(normalizeMemberNumber(undefined), "");
  });
});

describe("member number comparison", () => {
  it("compares case-insensitively after trim", () => {
    assert.equal(memberNumbersEqual(" AB-7 ", "ab-7"), true);
    assert.equal(memberNumbersEqual("0042", "0043"), false);
    assert.equal(memberNumbersEqual("   ", "0042"), false);
    assert.equal(memberNumberKey(" Ab-7 "), "ab-7");
  });

  it("matches a list search query", () => {
    assert.equal(memberNumberMatchesQuery("0042", "42"), true);
    assert.equal(memberNumberMatchesQuery("  AB-7 ", "ab"), true);
    assert.equal(memberNumberMatchesQuery("0042", "ana"), false);
    assert.equal(memberNumberMatchesQuery("", "42"), false);
  });
});

describe("findRosterStudentByMemberNumber", () => {
  it("returns null when the number is optional and blank", () => {
    assert.equal(findRosterStudentByMemberNumber(roster, "   "), null);
  });

  it("names the other student on a case-insensitive collision", () => {
    const match = findRosterStudentByMemberNumber(roster, " AB-7");
    assert.ok(match);
    assert.equal(match?.id, "bruno");
    assert.equal(match?.name, "Bruno Silva");
    assert.equal(match?.memberNumber, "ab-7");
  });

  it("ignores the student being edited, including the linked auth id", () => {
    assert.equal(
      findRosterStudentByMemberNumber(roster, "0042", { excludeIds: ["auth-ana"] }),
      null
    );
    const conflict = findRosterStudentByMemberNumber(roster, "0042", { excludeIds: ["carla"] });
    assert.equal(conflict?.name, "Ana Costa");
  });

  it("does not treat students without a number as conflicts", () => {
    assert.equal(findRosterStudentByMemberNumber(roster, "9999"), null);
  });
});

describe("memberNumberTakenWarning", () => {
  it("is a PT-PT warning that names the other student", () => {
    assert.equal(
      memberNumberTakenWarning(" 0042 ", "Ana Costa"),
      "O n.º de sócio «0042» já está atribuído a Ana Costa. Escolha outro número."
    );
  });
});

describe("firstMemberNumber", () => {
  it("prefers the first non-empty copy", () => {
    assert.equal(firstMemberNumber("  ", "0042", "0099"), "0042");
    assert.equal(firstMemberNumber(undefined, null, ""), "");
  });
});
