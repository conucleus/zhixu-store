import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVIDENCE_MAX_FILE_BYTES,
  missingTaskEvidenceFieldLabels,
  resolveTaskEvidenceType,
  validateEvidenceFile
} from "./workbenchSupport";

describe("task evidence type resolution", () => {
  it("maps a declared customs declaration to customs_declaration", () => {
    assert.deepEqual(resolveTaskEvidenceType(["报关单"]), {
      status: "resolved",
      documentType: "customs_declaration",
      businessLabel: "报关单"
    });
  });

  it("maps other registered declarations to their document types", () => {
    assert.deepEqual(resolveTaskEvidenceType(["提单"]), {
      status: "resolved",
      documentType: "bill_of_lading",
      businessLabel: "提单"
    });
    assert.deepEqual(resolveTaskEvidenceType(["验收单"]), {
      status: "resolved",
      documentType: "acceptance_certificate",
      businessLabel: "验收单"
    });
  });

  it("reports empty when the task declares no evidence", () => {
    assert.equal(resolveTaskEvidenceType([]).status, "empty");
    assert.equal(resolveTaskEvidenceType(["  "]).status, "empty");
  });

  it("reports unmapped labels instead of mislabeling them", () => {
    const resolution = resolveTaskEvidenceType(["质检单"]);
    assert.equal(resolution.status, "unmapped");
    assert.deepEqual(resolution.status === "unmapped" ? resolution.labels : [], ["质检单"]);
  });

  it("reports ambiguity when one upload cannot satisfy several evidence types", () => {
    const resolution = resolveTaskEvidenceType(["报关单", "提单"]);
    assert.equal(resolution.status, "ambiguous");
    assert.deepEqual(resolution.status === "ambiguous" ? resolution.documentTypes : [], [
      "customs_declaration",
      "bill_of_lading"
    ]);
  });
});

describe("evidence file validation", () => {
  it("accepts a PDF within the size limit", () => {
    assert.equal(validateEvidenceFile({ size: 1024, name: "出口报关单.pdf", type: "application/pdf" }), undefined);
    assert.equal(validateEvidenceFile({ size: 1024, name: "报关单.pdf", type: "" }), undefined);
  });

  it("rejects non-PDF files", () => {
    assert.match(validateEvidenceFile({ size: 10, name: "照片.jpg", type: "image/jpeg" }) ?? "", /PDF/u);
    assert.match(validateEvidenceFile({ size: 10, name: "数据.json", type: "application/json" }) ?? "", /PDF/u);
    assert.match(validateEvidenceFile({ size: 10, name: "凭证.txt", type: "text/plain" }) ?? "", /PDF/u);
  });

  it("rejects files above the 10MB API-aligned limit", () => {
    const error = validateEvidenceFile({ size: EVIDENCE_MAX_FILE_BYTES + 1, name: "大文件.pdf", type: "application/pdf" });
    assert.match(error ?? "", /10MB/u);
  });

  it("rejects empty files", () => {
    assert.match(validateEvidenceFile({ size: 0, name: "空.pdf", type: "application/pdf" }) ?? "", /为空/u);
  });
});

describe("task evidence field validation", () => {
  it("lists every missing required field by its visible label", () => {
    assert.deepEqual(
      missingTaskEvidenceFieldLabels({ referenceNo: "", exportPort: "", completionDate: "", notes: "" }),
      ["报关单号", "出口港口", "完成时间"]
    );
  });

  it("ignores whitespace-only input and optional notes", () => {
    assert.deepEqual(
      missingTaskEvidenceFieldLabels({ referenceNo: "  ", exportPort: "洋山港", completionDate: "", notes: "x" }),
      ["报关单号", "完成时间"]
    );
    assert.deepEqual(
      missingTaskEvidenceFieldLabels({ referenceNo: "12345", exportPort: "洋山港", completionDate: "2026-08-01", notes: "" }),
      []
    );
  });
});
