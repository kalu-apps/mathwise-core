import { describe, expect, it } from "vitest";
import {
  formatUserPrimaryName,
  formatUserShortName,
  getUserAvatarInitial,
} from "@/shared/lib/userDisplayName";

describe("user display name formatting", () => {
  it("formats first and last name as Имя Ф.", () => {
    expect(
      formatUserShortName({
        firstName: "Иван",
        lastName: "Калугин",
        email: "ivan@example.com",
      })
    ).toBe("Иван К.");
  });

  it("uses first token from long first name and last initial", () => {
    expect(
      formatUserShortName({
        firstName: "Анна Викторовна",
        lastName: "Калугина",
        email: "anna@example.com",
      })
    ).toBe("Анна К.");
  });

  it("falls back to first name only when last name is missing", () => {
    expect(
      formatUserShortName({
        firstName: "Иван",
        lastName: "",
        email: "ivan@example.com",
      })
    ).toBe("Иван");
  });

  it("falls back to email local part when name is missing", () => {
    expect(
      formatUserShortName({
        firstName: "",
        lastName: "",
        email: "teacher.demo@axiom.test",
      })
    ).toBe("teacher.demo");
    expect(
      getUserAvatarInitial({
        firstName: "",
        lastName: "",
        email: "teacher.demo@axiom.test",
      })
    ).toBe("T");
  });

  it("formats header name as full firstName without last-name abbreviation", () => {
    expect(
      formatUserPrimaryName({
        firstName: "Анна Викторовна",
        lastName: "Калугина",
        email: "anna@example.com",
      })
    ).toBe("Анна Викторовна");
  });
});
