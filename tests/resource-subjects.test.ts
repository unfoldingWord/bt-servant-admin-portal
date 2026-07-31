import { describe, expect, it } from "vitest";

import { subjectLabel } from "../src/lib/resource-subjects";

describe("subjectLabel", () => {
  it("maps canonical slugs to their display labels", () => {
    expect(subjectLabel("bible")).toBe("Bible Translations");
    expect(subjectLabel("translation-notes")).toBe("Translation Notes");
    expect(subjectLabel("translation-words-links")).toBe(
      "Translation Words Links"
    );
    expect(subjectLabel("media")).toBe("Images, Maps & Videos");
  });

  it("humanizes unknown slugs instead of dropping them (open-set contract)", () => {
    // worker#257: unmapped server vocabulary is slugified, not dropped —
    // new categories must degrade to "visible but unknown".
    expect(subjectLabel("ubs-handbooks")).toBe("Ubs Handbooks");
    expect(subjectLabel("commentary")).toBe("Commentary");
  });

  it("tolerates malformed slugs without crashing", () => {
    expect(subjectLabel("")).toBe("");
    expect(subjectLabel("--double--dashes--")).toBe("Double Dashes");
  });
});
