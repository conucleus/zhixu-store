import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import {
  EVIDENCE_MAX_FILE_BYTES,
  FRAMEWORK_METADATA_PREFIX,
  FRAMEWORK_NOTES_FIELD_KEY,
  FRAMEWORK_STAGE_FIELD_KEY,
  acceptAllowsFile,
  acceptAttribute,
  acceptHint,
  canCreateProductOrder,
  acceptIncludesPdf,
  evidenceMetadataSignature,
  FALLBACK_EVIDENCE_SLOT_KEY,
  formatAcceptLabel,
  isEvidenceSlotStale,
  missingTaskEvidenceSlotLabels,
  planTaskEvidence,
  resolveWorkbenchTask,
  validateEvidenceFileForSlot
} from "./workbenchSupport";
import { customsDemoTaskConfig } from "../demo/customs-demo-config";

function minimalTask(taskId: string): ProductTaskDTO {
  return {
    taskId,
    orderId: "order-1",
    orderTitle: "测试订单",
    zhixuId: "zhixu-1",
    title: `任务 ${taskId}`,
    subtitle: "",
    assigneeRole: "执行方",
    stageId: "stage-1",
    stageName: "阶段一",
    deadline: "2026-12-31",
    fundingImpact: "",
    requiredEvidence: [],
    status: "open",
    responsibilityStatements: [],
    proofRows: []
  };
}

/** 测试用的最小 File 形状：只依赖 size/name/type/slice，能在 Node 测试环境运行。 */
function fakeFile(input: { readonly name: string; readonly type: string; readonly bytes: Uint8Array; readonly size?: number }): File {
  const size = input.size ?? input.bytes.length;
  const file = new File([input.bytes as unknown as BlobPart], input.name, { type: input.type });
  if (size !== file.size) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

describe("frozen zhixu lifecycle gates", () => {
  const publication = {
    status: "published" as const,
    label: "已发布",
    stateMachineLabel: "已部署",
    planId: "plan-1",
    planHash: "hash-1"
  };

  it("requires publication in addition to review approval", () => {
    assert.equal(canCreateProductOrder({ reviewStatus: "approved", planPublication: publication }), true);
    assert.equal(canCreateProductOrder({
      reviewStatus: "approved",
      planPublication: { ...publication, status: "not_found" }
    }), false);
  });

  it("keeps restricted published plans active", () => {
    assert.equal(canCreateProductOrder({ reviewStatus: "restricted", planPublication: publication }), true);
  });
});

describe("task evidence plan (schema-driven)", () => {
  it("builds slots from the nucleation-core-carried evidenceSpec", () => {
    const plan = planTaskEvidence({
      evidenceSpec: customsDemoTaskConfig.evidenceSpec,
      requiredEvidence: ["报关单 PDF", "报关单号", "出口港口", "完成时间"]
    });
    assert.equal(plan.mode, "spec");
    assert.deepEqual(plan.slots.map((slot) => slot.key), [
      "customs_declaration_pdf",
      "customs_declaration_no",
      "export_port",
      "completion_date"
    ]);
    const fileSlot = plan.slots[0];
    assert.equal(fileSlot?.inputKind, "file");
    assert.deepEqual(fileSlot?.accept, ["application/pdf", ".pdf"]);
    assert.equal(fileSlot?.required, true);
    assert.equal(plan.slots[1]?.inputKind, "text");
    assert.equal(plan.slots[3]?.inputKind, "date");
    // 旧声明文本原样保留，不静默丢弃
    assert.deepEqual(plan.declaredLabels, ["报关单 PDF", "报关单号", "出口港口", "完成时间"]);
  });

  it("defaults inputKind to file and required to true when the spec omits them", () => {
    const plan = planTaskEvidence({
      requiredEvidence: [],
      evidenceSpec: [{ key: "report", label: "报告", accept: ["application/pdf"] }]
    });
    assert.equal(plan.mode, "spec");
    assert.deepEqual(plan.slots, [
      { key: "report", label: "报告", inputKind: "file", accept: ["application/pdf"], required: true, source: "spec" }
    ]);
  });

  it("degrades missing-spec declarations into one generic upload slot without dropping them", () => {
    const plan = planTaskEvidence({ requiredEvidence: ["质检单", "物流回单"] });
    assert.equal(plan.mode, "fallback");
    assert.equal(plan.slots.length, 1);
    const slot = plan.slots[0];
    assert.equal(slot?.key, FALLBACK_EVIDENCE_SLOT_KEY);
    assert.equal(slot?.source, "fallback");
    assert.deepEqual(slot?.accept, []);
    // 未知声明不出现在上传前拒绝，也不被丢弃：随元数据上送
    assert.deepEqual(plan.declaredLabels, ["质检单", "物流回单"]);
  });

  it("reports no evidence plan when the task declares nothing", () => {
    assert.deepEqual(planTaskEvidence({ requiredEvidence: [] }), { mode: "none", slots: [], declaredLabels: [] });
    assert.deepEqual(planTaskEvidence({ requiredEvidence: ["  "] }), { mode: "none", slots: [], declaredLabels: [] });
  });

  it("prefers evidenceSpec over label parsing: no store-side label table exists", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [{ key: "whatever_key", label: "任意业务凭证", inputKind: "file", accept: ["image/png"] }],
      requiredEvidence: ["商店不认识的声明"]
    });
    assert.equal(plan.mode, "spec");
    assert.equal(plan.slots[0]?.key, "whatever_key");
  });
});

describe("evidence accept constraints", () => {
  it("matches files by MIME or extension against the configured accept list", () => {
    assert.equal(acceptAllowsFile(["application/pdf", ".pdf"], { size: 10, name: "凭证.PDF", type: "" }), true);
    assert.equal(acceptAllowsFile(["application/pdf"], { size: 10, name: "凭证.pdf", type: "application/pdf" }), true);
    assert.equal(acceptAllowsFile([".pdf"], { size: 10, name: "照片.jpg", type: "image/jpeg" }), false);
    assert.equal(acceptAllowsFile([], { size: 10, name: "任意.bin", type: "" }), true);
  });

  it("normalizes bare extension entries so accept=[\"pdf\"] no longer bypasses checks", () => {
    // 历史写法 accept=["pdf"]（无点前缀）既匹配不到扩展名，也绕过 %PDF- 快检。
    assert.equal(acceptAllowsFile(["pdf"], { size: 10, name: "凭证.pdf", type: "" }), true);
    assert.equal(acceptAllowsFile(["pdf"], { size: 10, name: "照片.jpg", type: "" }), false);
    assert.equal(acceptIncludesPdf(["pdf"]), true);
    assert.equal(acceptAttribute(["pdf"]), ".pdf");
  });

  it("detects pdf-requiring accept lists for the magic-byte fast path", () => {
    assert.equal(acceptIncludesPdf(["application/pdf", ".pdf"]), true);
    assert.equal(acceptIncludesPdf(["image/png"]), false);
    assert.equal(acceptIncludesPdf([]), false);
  });

  it("derives the input accept attribute and human hint from the spec", () => {
    assert.equal(acceptAttribute(["application/pdf", ".pdf"]), "application/pdf,.pdf");
    assert.equal(acceptAttribute([]), undefined);
    assert.equal(formatAcceptLabel(["application/pdf", ".pdf", "image/png"]), "PDF、PNG");
    assert.equal(acceptHint(["application/pdf"]), "仅支持 PDF 格式");
    assert.equal(acceptHint([]), "不限格式");
  });
});

describe("evidence file validation (spec-driven)", () => {
  const pdfAccept = { accept: ["application/pdf", ".pdf"] };

  it("accepts a real PDF within the size limit", async () => {
    const file = fakeFile({ name: "凭证.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7 body") });
    assert.equal(await validateEvidenceFileForSlot(file, pdfAccept), undefined);
    // 伪造 MIME 但扩展名正确且内容真实：仍应通过（内容是权威信号）
    const forgedMime = fakeFile({ name: "凭证.pdf", type: "", bytes: new TextEncoder().encode("%PDF-1.4 ok") });
    assert.equal(await validateEvidenceFileForSlot(forgedMime, pdfAccept), undefined);
  });

  it("rejects files outside the configured accept list", async () => {
    const jpg = fakeFile({ name: "现场照片.jpg", type: "image/jpeg", bytes: new TextEncoder().encode("not a pdf") });
    assert.match(await validateEvidenceFileForSlot(jpg, pdfAccept) ?? "", /仅支持 PDF 格式/u);
    const json = fakeFile({ name: "数据.json", type: "application/json", bytes: new TextEncoder().encode("{}") });
    assert.match(await validateEvidenceFileForSlot(json, pdfAccept) ?? "", /仅支持 PDF 格式/u);
  });

  it("rejects forged MIME/extension when the content lacks the %PDF- magic (STORE-02)", async () => {
    const forged = fakeFile({ name: "伪造.pdf", type: "application/pdf", bytes: new TextEncoder().encode("MZ fake pdf content") });
    assert.match(
      await validateEvidenceFileForSlot(forged, pdfAccept) ?? "",
      /%PDF-/u
    );
    const truncatedMagic = fakeFile({ name: "截断.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF") });
    assert.match(await validateEvidenceFileForSlot(truncatedMagic, pdfAccept) ?? "", /%PDF-/u);
  });

  it("does not require PDF magic when the accept list does not ask for pdf", async () => {
    const png = fakeFile({ name: "截图.png", type: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    assert.equal(await validateEvidenceFileForSlot(png, { accept: ["image/png"] }), undefined);
    const anyFile = fakeFile({ name: "回单.txt", type: "text/plain", bytes: new TextEncoder().encode("hello") });
    assert.equal(await validateEvidenceFileForSlot(anyFile, { accept: [] }), undefined);
  });

  it("rejects files above the 10MB API-aligned limit", async () => {
    const file = fakeFile({ name: "大文件.pdf", type: "application/pdf", size: EVIDENCE_MAX_FILE_BYTES + 1, bytes: new TextEncoder().encode("%PDF-") });
    assert.match(await validateEvidenceFileForSlot(file, pdfAccept) ?? "", /10MB/u);
  });

  it("rejects empty files", async () => {
    const file = fakeFile({ name: "空.pdf", type: "application/pdf", bytes: new Uint8Array() });
    assert.match(await validateEvidenceFileForSlot(file, pdfAccept) ?? "", /为空/u);
  });
});

describe("task evidence slot required-check", () => {
  it("lists every missing required slot by its configured label", () => {
    const plan = planTaskEvidence({
      evidenceSpec: customsDemoTaskConfig.evidenceSpec,
      requiredEvidence: []
    });
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(plan.slots, {}, []),
      ["报关单 PDF", "报关单号", "出口港口", "完成时间"]
    );
  });
  it("ignores uploaded file slots, filled fields and optional slots", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        ...customsDemoTaskConfig.evidenceSpec,
        { key: "extra_note", label: "补充说明", inputKind: "text", required: false }
      ],
      requiredEvidence: []
    });
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(
        plan.slots,
        { customs_declaration_no: "  ", export_port: "洋山港", extra_note: "" },
        ["customs_declaration_pdf"]
      ),
      ["报关单号", "完成时间"]
    );
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(
        plan.slots,
        { customs_declaration_no: "12345", export_port: "洋山港", completion_date: "2026-08-01" },
        ["customs_declaration_pdf"]
      ),
      []
    );
  });

  it("requires the generic upload in fallback mode before submit", () => {
    const plan = planTaskEvidence({ requiredEvidence: ["任意声明"] });
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, []), ["阶段凭证"]);
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, [FALLBACK_EVIDENCE_SLOT_KEY]), []);
  });

  it("treats a text/date-only task with all fields filled as submittable without any upload", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        { key: "completion_date", label: "完成时间", inputKind: "date", required: true },
        { key: "remark", label: "备注说明", inputKind: "text", required: false }
      ],
      requiredEvidence: []
    });
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, []), ["完成时间"]);
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(plan.slots, { completion_date: "2026-09-01" }, []),
      []
    );
  });

  it("treats a task with no evidence slots as submittable with zero uploads", () => {
    const plan = planTaskEvidence({ requiredEvidence: [] });
    assert.equal(plan.mode, "none");
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, []), []);
  });

  it("still blocks submit while a required file slot has no upload", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        { key: "report", label: "报告", inputKind: "file", required: true },
        { key: "completion_date", label: "完成时间", inputKind: "date", required: true }
      ],
      requiredEvidence: []
    });
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(plan.slots, { completion_date: "2026-09-01" }, []),
      ["报告"]
    );
  });
});

describe("workbench task resolution", () => {
  const taskA = minimalTask("task-a");
  const taskB = minimalTask("task-b");
  const tasks = [taskA, taskB];

  it("opens the selected task carried by its own card, not the projection's active task", () => {
    assert.equal(resolveWorkbenchTask(tasks, "task-b", taskA), taskB);
  });

  it("falls back to the projected active task when nothing is selected", () => {
    assert.equal(resolveWorkbenchTask(tasks, undefined, taskA), taskA);
  });

  it("falls back to the projected active task when the selected id no longer exists", () => {
    assert.equal(resolveWorkbenchTask(tasks, "task-gone", taskA), taskA);
  });

  it("stays undefined when there is no selection and no projected task", () => {
    assert.equal(resolveWorkbenchTask(tasks, undefined, undefined), undefined);
  });
});

describe("evidence metadata snapshot staleness", () => {
  it("does not flag a slot without an upload snapshot", () => {
    assert.equal(isEvidenceSlotStale(undefined, { any: "value" }), false);
  });

  it("accepts the same field set regardless of key order or surrounding whitespace", () => {
    const snapshot = evidenceMetadataSignature({ port: " 洋山港 ", no: "123" });
    assert.equal(isEvidenceSlotStale(snapshot, { no: "123", port: "洋山港" }), false);
  });

  it("flags a slot stale when any fingerprinted field changed after upload", () => {
    const snapshot = evidenceMetadataSignature({ port: "洋山港", no: "123" });
    assert.equal(isEvidenceSlotStale(snapshot, { port: "深圳港", no: "123" }), true);
    // 清空字段同样是变更（空值不进入指纹），必须判 stale
    assert.equal(isEvidenceSlotStale(snapshot, { port: "", no: "123" }), true);
  });

  it("ignores whitespace-only differences, matching upload metadata semantics", () => {
    const snapshot = evidenceMetadataSignature({ port: "洋山港" });
    assert.equal(isEvidenceSlotStale(snapshot, { port: "  洋山港  " }), false);
  });
});

describe("framework reserved keys are namespaced", () => {
  it("keeps framework stage/notes keys out of the spec key space", () => {
    // 凝结核 spec 可以声明任意 key（包括 notes/stage 这类通用词）；
    // 框架保留键必须带命名空间前缀，不能与 spec 键互相污染。
    assert.notEqual(FRAMEWORK_NOTES_FIELD_KEY, "notes");
    assert.notEqual(FRAMEWORK_STAGE_FIELD_KEY, "stage");
    assert.ok(FRAMEWORK_NOTES_FIELD_KEY.startsWith(FRAMEWORK_METADATA_PREFIX));
    assert.ok(FRAMEWORK_STAGE_FIELD_KEY.startsWith(FRAMEWORK_METADATA_PREFIX));
  });

  it("lets a spec slot use the bare key \"notes\" without touching the framework note", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [{ key: "notes", label: "结关备注", inputKind: "text", required: true }],
      requiredEvidence: []
    });
    assert.equal(plan.slots[0]?.key, "notes");
    const specSnapshot = evidenceMetadataSignature({ notes: "spec value" });
    const frameworkSnapshot = evidenceMetadataSignature({ [FRAMEWORK_NOTES_FIELD_KEY]: "framework value" });
    assert.notEqual(specSnapshot, frameworkSnapshot);
  });
});
