import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FulfillmentPluginKind, ProductTaskDTO } from "@uvp-eth/product-dto";
import {
  EVIDENCE_MAX_FILE_BYTES,
  FRAMEWORK_METADATA_PREFIX,
  FRAMEWORK_NOTES_FIELD_KEY,
  FRAMEWORK_STAGE_FIELD_KEY,
  acceptAllowsFile,
  acceptAttribute,
  acceptHint,
  canCreateProductOrder,
  canSubmitWorkbenchTask,
  acceptIncludesPdf,
  evidenceMetadataSignature,
  formatAcceptLabel,
  inviteLinkForInvite,
  isEvidenceSlotStale,
  missingTaskEvidenceSlotLabels,
  planTaskEvidence,
  readableError,
  resolveWorkbenchTask,
  stateMachineSignExpectation,
  submissionPollOutcome,
  submissionTerminalMessage,
  taskSubmitActionLabel,
  taskSubmitIntent,
  validateEvidenceFileForSlot,
  advanceScopeGeneration,
  scopeGenerationValue
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
      evidenceSpec: customsDemoTaskConfig.evidenceSpec
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
  });

  it("defaults inputKind to file and required to true when the spec omits them", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [{ key: "report", label: "报告", accept: ["application/pdf"] }]
    });
    assert.equal(plan.mode, "spec");
    assert.deepEqual(plan.slots, [
      { key: "report", documentType: "report", label: "报告", inputKind: "file", accept: ["application/pdf"], required: true }
    ]);
  });

  it("renders no evidence slots for tasks without spec or resource requirements instead of a fabricated generic upload", () => {
    // 单轨口径：仅消费 evidenceSpec 与结构化资源要求。两者皆无的任务
    // 不回退解析 requiredEvidence 臆造通用槽位——没有槽位就是没有槽位。
    assert.deepEqual(planTaskEvidence({}), { mode: "none", slots: [] });
    assert.deepEqual(planTaskEvidence({ evidenceSpec: [] }), { mode: "none", slots: [] });
    assert.deepEqual(planTaskEvidence({ evidenceSpec: undefined }), { mode: "none", slots: [] });
  });

  it("keeps structured resource requirement slots when the spec is missing (aligned with uvp-order-app)", () => {
    const plan = planTaskEvidence({
      resourceRequirements: [
        { resourceId: "inspection_report", label: "第三方检验证明", required: true, source: "resource_patch", resourceType: "document" },
        { resourceId: "internal_meta", label: "内部元数据", required: false, source: "plan_default", resourceType: "metadata" }
      ]
    });
    assert.equal(plan.mode, "none");
    assert.deepEqual(plan.slots, [
      { key: "resource-requirement:inspection_report", documentType: "document", label: "第三方检验证明", inputKind: "file", accept: [], required: true }
    ]);
  });

  it("uploads resource fallback slots with the resource's own documentType, not the slot key (aligned with uvp-order-app)", () => {
    // documentType 参与服务端指纹：两端对同一资源任务必须送出同一
    // documentType，槽位 key 只是前端归档键，不得进入上传载荷。
    const plan = planTaskEvidence({
      resourceRequirements: [
        { resourceId: "inspection_report", label: "第三方检验证明", required: true, source: "resource_patch", resourceType: "document" },
        { resourceId: "site_photo", label: "现场照片", required: true, source: "participant_input" }
      ]
    });
    assert.deepEqual(
      plan.slots.map((slot) => [slot.key, slot.documentType]),
      [
        ["resource-requirement:inspection_report", "document"],
        ["resource-requirement:site_photo", "site_photo"]
      ]
    );
  });

  it("drops an invalid evidenceSpec entirely instead of rendering duplicate slots (aligned with uvp-order-app)", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        { key: "", label: "空 key" },
        { key: "dup", label: "重复" },
        { key: "dup", label: "重复" }
      ],
      resourceRequirements: [
        { resourceId: "fallback_doc", label: "兜底凭证", required: true, source: "resource_patch" }
      ]
    });
    assert.equal(plan.mode, "none");
    assert.deepEqual(plan.slots.map((slot) => slot.key), ["resource-requirement:fallback_doc"]);
  });

  it("merges spec slots with structured resource requirements into one todo view (evidence rules §2.2)", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [{ key: "customs_declaration_pdf", label: "报关单", accept: ["application/pdf"] }],
      resourceRequirements: [
        { resourceId: "inspection_report", label: "第三方检验证明", required: true, source: "resource_patch", resourceType: "document" },
        { resourceId: "internal_meta", label: "内部元数据", required: false, source: "plan_default", resourceType: "metadata" }
      ]
    });
    assert.equal(plan.mode, "spec");
    // spec 与资源要求并存时两者都进上传槽位；metadata 型资源仍被排除。
    assert.deepEqual(plan.slots.map((slot) => [slot.key, slot.documentType]), [
      ["customs_declaration_pdf", "customs_declaration_pdf"],
      ["resource-requirement:inspection_report", "document"]
    ]);
  });

  it("deduplicates merged slots by documentType so one credential is not uploaded twice", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [{ key: "document", label: "单据凭证" }],
      resourceRequirements: [
        { resourceId: "doc_copy", label: "同一单据的资源副本", required: true, source: "resource_patch", resourceType: "document" },
        { resourceId: "site_photo", label: "现场照片", required: true, source: "participant_input" }
      ]
    });
    // resourceType 与 spec key 同为 document 的资源要求已由 spec 槽位覆盖，
    // 不重复渲染；未被覆盖的资源要求保留。
    assert.deepEqual(plan.slots.map((slot) => slot.key), ["document", "resource-requirement:site_photo"]);
  });
});

describe("evidence accept constraints", () => {
  it("matches files by MIME or extension against the configured accept list", () => {
    assert.equal(acceptAllowsFile(["application/pdf", ".pdf"], { size: 10, name: "凭证.PDF", type: "" }), true);
    assert.equal(acceptAllowsFile(["application/pdf"], { size: 10, name: "凭证.pdf", type: "application/pdf" }), true);
    assert.equal(acceptAllowsFile([".pdf"], { size: 10, name: "照片.jpg", type: "image/jpeg" }), false);
    assert.equal(acceptAllowsFile([], { size: 10, name: "任意.bin", type: "" }), true);
  });

  it("expands wildcard MIME entries so image/* slots are uploadable", () => {
    assert.equal(acceptAllowsFile(["image/*"], { size: 10, name: "照片.png", type: "image/png" }), true);
    assert.equal(acceptAllowsFile(["image/*"], { size: 10, name: "照片.jpg", type: "image/jpeg" }), true);
    assert.equal(acceptAllowsFile(["image/*"], { size: 10, name: "凭证.pdf", type: "application/pdf" }), false);
    assert.equal(acceptAllowsFile(["*/*"], { size: 10, name: "任意.png", type: "image/png" }), true);
  });

  it("normalizes bare extension entries so accept=[\"pdf\"] cannot bypass checks", () => {
    // 无点前缀的 accept=["pdf"] 既匹配不到扩展名，也绕不过 %PDF- 快检的前提
    // 是先归一化补点。
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
      evidenceSpec: customsDemoTaskConfig.evidenceSpec
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
      ]
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

  it("treats a text/date-only task with all fields filled as submittable without any upload", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        { key: "completion_date", label: "完成时间", inputKind: "date", required: true },
        { key: "remark", label: "备注说明", inputKind: "text", required: false }
      ]
    });
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, []), ["完成时间"]);
    assert.deepEqual(
      missingTaskEvidenceSlotLabels(plan.slots, { completion_date: "2026-09-01" }, []),
      []
    );
  });

  it("treats a task with no evidence slots as submittable with zero uploads", () => {
    const plan = planTaskEvidence({});
    assert.equal(plan.mode, "none");
    assert.deepEqual(missingTaskEvidenceSlotLabels(plan.slots, {}, []), []);
  });

  it("still blocks submit while a required file slot has no upload", () => {
    const plan = planTaskEvidence({
      evidenceSpec: [
        { key: "report", label: "报告", inputKind: "file", required: true },
        { key: "completion_date", label: "完成时间", inputKind: "date", required: true }
      ]
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

  it("orders signature keys by code point, not UTF-16 code units", () => {
    const astral = "\u{1F600}键";
    const bmp = "\uFFFF键";
    assert.equal(
      evidenceMetadataSignature({ [astral]: "1", [bmp]: "2" }),
      JSON.stringify([[bmp, "2"], [astral, "1"]])
    );
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
      evidenceSpec: [{ key: "notes", label: "结关备注", inputKind: "text", required: true }]
    });
    assert.equal(plan.slots[0]?.key, "notes");
    const specSnapshot = evidenceMetadataSignature({ notes: "spec value" });
    const frameworkSnapshot = evidenceMetadataSignature({ [FRAMEWORK_NOTES_FIELD_KEY]: "framework value" });
    assert.notEqual(specSnapshot, frameworkSnapshot);
  });
});

describe("submission poll tiering", () => {
  it("only server terminal states may resolve as failure", () => {
    assert.equal(submissionPollOutcome("confirmed"), "confirmed");
    assert.equal(submissionPollOutcome("failed"), "terminal_failure");
    assert.equal(submissionPollOutcome("expired"), "terminal_failure");
    assert.equal(submissionPollOutcome("replaced"), "terminal_failure");
    for (const pending of ["prepared", "signature_received", "broadcasting", "submitted", "indexing"] as const) {
      assert.equal(submissionPollOutcome(pending), "pending");
    }
  });

  it("wording for replaced forbids blind resubmission", () => {
    assert.match(submissionTerminalMessage("replaced"), /请以最新提交记录为准/u);
    assert.match(submissionTerminalMessage("expired"), /可重新提交/u);
    assert.equal(submissionTerminalMessage("failed", "signal_rejected"), "signal_rejected");
    assert.equal(submissionTerminalMessage("failed"), "提交失败，可重试");
  });
});

describe("submit terminal gate (server authority + session final state)", () => {
  const task = (status: ProductTaskDTO["status"], canSubmit?: boolean): Pick<ProductTaskDTO, "status" | "canSubmit"> => ({
    status,
    ...(canSubmit === undefined ? {} : { canSubmit })
  });

  it("keeps non-open or unauthorized tasks out of the submit entry (fail-closed)", () => {
    // status/canSubmit 是 DTO 的服务端权威门：已提交待索引、已完成、受阻、
    // 钱包无提交权的任务都不呈现可提交入口。
    assert.equal(canSubmitWorkbenchTask(task("open"), "idle"), true);
    assert.equal(canSubmitWorkbenchTask(task("open", false), "idle"), false);
    assert.equal(canSubmitWorkbenchTask(task("submitted"), "idle"), false);
    assert.equal(canSubmitWorkbenchTask(task("done"), "idle"), false);
    assert.equal(canSubmitWorkbenchTask(task("blocked"), "idle"), false);
  });

  it("forbids re-submitting in the same session after confirmation", () => {
    // confirmed 是本次会话终态闸：提交确认后不得再触发完整签名提交。
    assert.equal(canSubmitWorkbenchTask(task("open"), "confirmed"), false);
    assert.equal(canSubmitWorkbenchTask(task("open"), "failed"), true);
    // 刷新后投影仍未改判任务状态时（open）也保持闸住。
    assert.equal(canSubmitWorkbenchTask(task("open"), "tx_pending"), true);
  });
});

describe("signing domain expectation from deployment config", () => {
  it("derives the expectation from build-time config, not the checked response", () => {
    assert.deepEqual(
      stateMachineSignExpectation({ VITE_UVP_STATE_MACHINE_ADDRESS: " 0x0000000000000000000000000000000000000001 " }),
      { verifyingContract: "0x0000000000000000000000000000000000000001" }
    );
  });

  it("refuses to sign when the deployment config is missing or invalid (no conditional skip)", () => {
    assert.throws(() => stateMachineSignExpectation({}), /VITE_UVP_STATE_MACHINE_ADDRESS/u);
    assert.throws(() => stateMachineSignExpectation({ VITE_UVP_STATE_MACHINE_ADDRESS: "0x1234" }), /VITE_UVP_STATE_MACHINE_ADDRESS/u);
  });
});

describe("invite link carries the one-time token", () => {
  it("builds the uvp-order-app entry link with invite + inviteToken query", () => {
    const link = inviteLinkForInvite("invite-9", "one-time-token", "https://order-app.test/");
    assert.equal(link, "https://order-app.test/?invite=invite-9&inviteToken=one-time-token");
  });

  it("refuses to fall back to the store origin when the order-app URL is unconfigured", () => {
    // ?invite=&inviteToken= 的消费逻辑只在 uvp-order-app：回落本站 origin 会
    // 产出死链并外泄一次性令牌（fail-closed，不生成假可用链接）。
    assert.throws(() => inviteLinkForInvite("invite-9", "one-time-token"), /VITE_UVP_ORDER_APP_URL/u);
    assert.throws(() => inviteLinkForInvite("invite-9", "one-time-token", "  "), /VITE_UVP_ORDER_APP_URL/u);
  });
});

describe("readableError permission judgement", () => {
  it("maps permission errors only from the structured http status", () => {
    const forbidden = new Error("forbidden");
    (forbidden as { status?: number }).status = 403;
    assert.equal(readableError(forbidden, "fallback"), "当前账号没有权限执行该操作");
  });

  it("does not treat message substrings like 403 as a permission error", () => {
    // 订单号/块高等数字撞上"403"子串时不得误标为权限错误。
    const notForbidden = new Error("order 4031 not found");
    assert.equal(readableError(notForbidden, "fallback"), "order 4031 not found");
    const withOtherStatus = new Error("not found");
    (withOtherStatus as { status?: number }).status = 404;
    assert.equal(readableError(withOtherStatus, "fallback"), "not found");
  });
});

describe("spec-driven submit intent", () => {
  it("falls back to confirm_stage when the task carries no manifest", () => {
    assert.equal(taskSubmitIntent(minimalTask("task-1")), "confirm_stage");
  });

  it("takes the primary submit_signal action intent from the addOn manifest", () => {
    const task: ProductTaskDTO = {
      ...minimalTask("task-2"),
      addOnManifest: {
        schemaVersion: "participant-addon-manifest.v1",
        manifestId: "manifest-1",
        roleSlotId: "delivery",
        addOnKind: "submit_signal",
        title: "插件",
        summary: "",
        stageBindings: [],
        pages: [],
        actions: [
          { actionId: "a-secondary", actionKind: "submit_signal", label: "次要", inputBindings: {}, intent: "reject_stage" },
          { actionId: "a-primary", actionKind: "submit_signal", label: "主操作", primary: true, inputBindings: {}, intent: "resolve_dispute" }
        ]
      }
    };
    assert.equal(taskSubmitIntent(task), "resolve_dispute");
  });

  it("uses the first submit_signal action when none is marked primary", () => {
    const task: ProductTaskDTO = {
      ...minimalTask("task-3"),
      addOnManifest: {
        schemaVersion: "participant-addon-manifest.v1",
        manifestId: "manifest-2",
        roleSlotId: "delivery",
        addOnKind: "submit_signal",
        title: "插件",
        summary: "",
        stageBindings: [],
        pages: [],
        actions: [
          { actionId: "a-1", actionKind: "submit_signal", label: "动作", inputBindings: {} },
          { actionId: "a-2", actionKind: "stage_executor_patch", label: "补丁", inputBindings: {}, intent: "resolve_dispute" }
        ]
      }
    };
    assert.equal(taskSubmitIntent(task), "confirm_stage");
  });

  it("falls back to the capability plugin kind mapping when the manifest declares no intent (aligned with uvp-order-app)", () => {
    const withPluginKind = (taskId: string, pluginKind: FulfillmentPluginKind): ProductTaskDTO => ({
      ...minimalTask(taskId),
      capabilityPlugin: { pluginKind, source: "explicit" }
    });
    assert.equal(taskSubmitIntent(withPluginKind("task-dispute", "dispute_material")), "raise_dispute");
    assert.equal(taskSubmitIntent(withPluginKind("task-confirm", "delivery_update")), "confirm_stage");
  });

  it("prefers the manifest intent over a disagreeing capability plugin kind", () => {
    const task: ProductTaskDTO = {
      ...minimalTask("task-4"),
      capabilityPlugin: { pluginKind: "dispute_material", source: "explicit" },
      addOnManifest: {
        schemaVersion: "participant-addon-manifest.v1",
        manifestId: "manifest-3",
        roleSlotId: "delivery",
        addOnKind: "submit_signal",
        title: "插件",
        summary: "",
        stageBindings: [],
        pages: [],
        actions: [
          { actionId: "a-primary", actionKind: "submit_signal", label: "主操作", primary: true, inputBindings: {}, intent: "reject_stage" }
        ]
      }
    };
    assert.equal(taskSubmitIntent(task), "reject_stage");
  });

  it("derives the submit action copy from the server task payload, not from the intent", () => {
    // 提交文案由服务端随任务下发（manifest 主 submit_signal
    // 动作 label → 插件 primaryActionLabel → 任务级 primaryActionLabel →
    // 中性兜底），前端不再维护 intent→文案表。
    const manifestTask: ProductTaskDTO = {
      ...minimalTask("task-copy-1"),
      addOnManifest: {
        schemaVersion: "participant-addon-manifest.v1",
        manifestId: "manifest-copy",
        roleSlotId: "delivery",
        addOnKind: "submit_signal",
        title: "插件",
        summary: "",
        stageBindings: [],
        pages: [],
        actions: [
          { actionId: "a-primary", actionKind: "submit_signal", label: "拒绝本阶段", primary: true, inputBindings: {}, intent: "reject_stage" },
          { actionId: "a-secondary", actionKind: "submit_signal", label: "次要动作", inputBindings: {} }
        ]
      }
    };
    assert.equal(taskSubmitActionLabel(manifestTask), "拒绝本阶段");

    const pluginTask: ProductTaskDTO = {
      ...minimalTask("task-copy-2"),
      capabilityPlugin: { pluginKind: "evidence_submission", source: "explicit", primaryActionLabel: "上传报关凭证" }
    };
    assert.equal(taskSubmitActionLabel(pluginTask), "上传报关凭证");

    const taskLevelLabel = { ...minimalTask("task-copy-3"), primaryActionLabel: "处理待办" };
    assert.equal(taskSubmitActionLabel(taskLevelLabel), "处理待办");

    // 无任何服务端文案时使用中性兜底：不含 confirm/reject 意图语义。
    assert.equal(taskSubmitActionLabel(minimalTask("task-copy-4")), "提交待办结果");
    // 争议插件类型本身也不改写文案——intent 只决定协议意图，不决定文案。
    const disputeTask: ProductTaskDTO = {
      ...minimalTask("task-copy-5"),
      capabilityPlugin: { pluginKind: "dispute_material", source: "explicit" }
    };
    assert.equal(taskSubmitActionLabel(disputeTask), "提交待办结果");
    assert.equal(taskSubmitIntent(disputeTask), "raise_dispute");
  });
});

describe("scope generation", () => {
  it("A→B→A 回切不复用作用域值：旧请求的 stale 检查不因键回切而失效", () => {
    let scope = { key: "zhixu-a" as string | undefined, generation: 1 };
    const aFirst = scopeGenerationValue(scope);
    // 同键重渲染（投影刷新）：代数不变，值稳定。
    scope = advanceScopeGeneration(scope, "zhixu-a");
    assert.equal(scopeGenerationValue(scope), aFirst);
    // 切到 B 再切回 A：键复用，代数推进——值不同于首次进入 A。
    scope = advanceScopeGeneration(scope, "zhixu-b");
    scope = advanceScopeGeneration(scope, "zhixu-a");
    assert.notEqual(scopeGenerationValue(scope), aFirst);
    // undefined 键（未选中目录）也参与同一口径。
    scope = advanceScopeGeneration(scope, undefined);
    assert.notEqual(scopeGenerationValue(scope), aFirst);
  });
});
