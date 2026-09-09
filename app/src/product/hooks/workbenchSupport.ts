import {
  lifecycleStatusForZhixu,
  validateTaskEvidenceSpec,
  type FulfillmentPluginKind,
  type ProductResourceRequirementDTO,
  type ProductTaskDTO,
  type TaskEvidenceSpecDTO,
  type ZhixuSummaryDTO
} from "@uvp-eth/product-dto";
import type { ProductSubmissionStatus } from "../api";

/**
 * Order creation follows the frozen lifecycle DTO.  Review approval alone is
 * not enough: the plan must also be published, and restricted plans remain
 * active when their published lifecycle says so.
 */
export function canCreateProductOrder(
  zhixu: Pick<ZhixuSummaryDTO, "reviewStatus" | "planPublication">
): boolean {
  return lifecycleStatusForZhixu(zhixu) === "active";
}

export function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (error.message.includes("required_participants_missing")) {
    return "关键参与方尚未全部接受邀请";
  }
  if (error.message.includes("evidence_required")) {
    return "请先上传凭证";
  }
  if (errorHttpStatus(error) === 403) {
    return "当前账号没有权限执行该操作";
  }
  return error.message && error.message !== "Failed to fetch" ? error.message : fallback;
}

/**
 * 权限判定只认结构化的 HTTP 状态字段（产品 API 错误对象携带的 status），
 * 不做消息子串匹配：消息里出现"403"数字（单号、块高等）不是权限错误。
 */
function errorHttpStatus(error: Error): number | undefined {
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * 任务证据计划的输入：凝结核随 zhixu 配置携带的结构化 evidenceSpec，
 * 以及任务投影下发的结构化资源要求（spec 缺失/非法时的证据槽位来源）。
 */
export interface TaskEvidencePlanInput {
  readonly evidenceSpec?: readonly TaskEvidenceSpecDTO[] | undefined;
  readonly resourceRequirements?: readonly ProductResourceRequirementDTO[] | undefined;
}

export type TaskEvidenceSlotInputKind = "file" | "text" | "date";

/** 渲染层的一个证据槽位：所有业务语义都来自凝结核配置。 */
export interface TaskEvidenceSlot {
  readonly key: string;
  readonly label: string;
  readonly inputKind: TaskEvidenceSlotInputKind;
  /** 文件槽位的 accept 约束（MIME 或扩展名）；空数组表示不限制格式。 */
  readonly accept: readonly string[];
  readonly required: boolean;
  readonly description?: string;
}

export interface TaskEvidencePlan {
  readonly mode: "spec" | "none";
  readonly slots: readonly TaskEvidenceSlot[];
}

/**
 * 把任务的证据要求解析为可渲染槽位。spec 缺失或非法时保留服务端结构化
 * 资源要求槽位（metadata 型除外）——与 uvp-order-app planTaskEvidence 同口径。
 *
 * 框架红线：商店不含业务标签匹配表。spec 与资源要求都不存在时没有证据
 * 槽位（纯字段确认或按业务约定线下提交），不臆造通用槽位，也不在上传前拒绝。
 */
export function planTaskEvidence(task: TaskEvidencePlanInput): TaskEvidencePlan {
  const spec = task.evidenceSpec;
  if (spec && spec.length > 0 && validateTaskEvidenceSpec(spec).length === 0) {
    return {
      mode: "spec",
      slots: spec.map((entry): TaskEvidenceSlot => ({
        key: entry.key,
        label: entry.label,
        inputKind: entry.inputKind ?? "file",
        accept: entry.inputKind === undefined || entry.inputKind === "file" ? [...(entry.accept ?? [])] : [],
        required: entry.required ?? true,
        ...(entry.description ? { description: entry.description } : {})
      }))
    };
  }
  const resourceSlots = (task.resourceRequirements ?? [])
    .filter((resource) => (resource.resourceType ?? resource.resourceId) !== "metadata")
    .map((resource): TaskEvidenceSlot => ({
      key: `resource-requirement:${resource.resourceId}`,
      label: resource.label,
      inputKind: "file",
      accept: [],
      required: resource.required
    }));
  return { mode: "none", slots: resourceSlots };
}

/** 与后端 Evidence Service 一致的限制：解码后最大 10MB（HTTP body 上限 16MB）。 */
export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface EvidenceFileMetadata {
  readonly size: number;
  readonly name: string;
  readonly type: string;
}

function normalizeAcceptEntry(entry: string): string {
  const trimmed = entry.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.startsWith(".") || trimmed.includes("/")) {
    return trimmed;
  }
  // 无点前缀的裸扩展名（如 "pdf"）：补点归一——不补点则既匹配不到文件
  // 扩展名，也绕过 %PDF- 首字节快检。
  return `.${trimmed}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/** accept 列表是否放行该文件（任一条目命中 MIME 或扩展名即放行）。 */
export function acceptAllowsFile(accept: readonly string[], file: EvidenceFileMetadata): boolean {
  if (accept.length === 0) {
    return true;
  }
  const rules = accept.map(normalizeAcceptEntry);
  const mime = file.type.trim().toLowerCase();
  const extension = extensionOf(file.name);
  return rules.some((rule) =>
    ruleAcceptsMime(rule, mime) || (extension.length > 0 && rule === extension)
  );
}

/**
 * MIME 条目按全等或 <type>/* 通配命中。协议校验器放行通配 MIME（如 image/*），
 * 若前端只做全等匹配，该槽位任何文件都匹配不上，永远无法上传。
 */
function ruleAcceptsMime(rule: string, mime: string): boolean {
  if (mime.length === 0) {
    return false;
  }
  if (rule === mime) {
    return true;
  }
  if (!rule.endsWith("/*")) {
    return false;
  }
  const typePrefix = rule.slice(0, -1);
  return typePrefix === "*/" || mime.startsWith(typePrefix);
}

const PDF_MIME = "application/pdf";
const PDF_EXTENSION = ".pdf";

/** accept=pdf 时需要额外的 %PDF- 首字节快检（防止伪造 MIME/扩展名绕过）。 */
export function acceptIncludesPdf(accept: readonly string[]): boolean {
  return accept.map(normalizeAcceptEntry).some((rule) => rule === PDF_MIME || rule === PDF_EXTENSION);
}

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  [PDF_MIME]: "PDF",
  [PDF_EXTENSION]: "PDF",
  "image/png": "PNG",
  ".png": "PNG",
  "image/jpeg": "JPG",
  ".jpg": "JPG",
  ".jpeg": "JPG"
};

/** 通用文件格式名（PDF/JPG…），仅按 accept 推导，不含业务语义。 */
export function formatAcceptLabel(accept: readonly string[]): string {
  const labels = [...new Set(accept.map(normalizeAcceptEntry).map((rule) => FORMAT_LABELS[rule] ?? rule))];
  return labels.join("、");
}

/** <input accept> 属性值（裸扩展名先归一化为带点形式）；空 accept 返回 undefined 表示不限制。 */
export function acceptAttribute(accept: readonly string[]): string | undefined {
  if (accept.length === 0) {
    return undefined;
  }
  return accept.map(normalizeAcceptEntry).join(",");
}

export function acceptHint(accept: readonly string[]): string {
  if (accept.length === 0) {
    return "不限格式";
  }
  return `仅支持 ${formatAcceptLabel(accept)} 格式`;
}

/** 同步部分校验：大小与 accept 的 MIME/扩展名约束。 */
export function validateEvidenceFileMetadata(
  file: EvidenceFileMetadata,
  accept: readonly string[]
): string | undefined {
  if (file.size <= 0) {
    return "凭证文件内容为空，请重新选择";
  }
  if (file.size > EVIDENCE_MAX_FILE_BYTES) {
    return "凭证文件超过 10MB，请压缩或拆分后再上传";
  }
  if (!acceptAllowsFile(accept, file)) {
    return `${acceptHint(accept)}的凭证文件`;
  }
  return undefined;
}

const PDF_MAGIC = "%PDF-";

/**
 * 上传前前端校验：accept 约束来自凝结核配置（spec.accept）而非硬编码；
 * 当 accept 要求 PDF 时，读取文件首字节做 %PDF- 快速拦截，
 * 伪造 MIME 或扩展名的文件在这里被拒绝（服务端魔数校验仍是权威）。
 */
export async function validateEvidenceFileForSlot(
  file: EvidenceFileMetadata & { readonly slice?: (start: number, end: number) => { readonly arrayBuffer: () => Promise<ArrayBuffer> } },
  slot: Pick<TaskEvidenceSlot, "accept">
): Promise<string | undefined> {
  const metadataError = validateEvidenceFileMetadata(file, slot.accept);
  if (metadataError) {
    return metadataError;
  }
  if (acceptIncludesPdf(slot.accept)) {
    const head = await readHead(file, PDF_MAGIC.length);
    if (head !== PDF_MAGIC) {
      return "文件内容不是有效的 PDF（缺少 %PDF- 标识），请重新导出后上传";
    }
  }
  return undefined;
}

async function readHead(
  file: EvidenceFileMetadata & { readonly slice?: (start: number, end: number) => { readonly arrayBuffer: () => Promise<ArrayBuffer> } },
  length: number
): Promise<string> {
  if (typeof file.slice !== "function") {
    return "";
  }
  try {
    const bytes = new Uint8Array(await file.slice(0, length).arrayBuffer());
    let head = "";
    for (const byte of bytes) {
      head += String.fromCharCode(byte);
    }
    return head;
  } catch {
    return "";
  }
}

/** 上传元数据里随文件上送的字段值（key 来自 spec，框架不含具体 key）。 */
export type TaskEvidenceFieldValues = Readonly<Record<string, string>>;

export const emptyTaskEvidenceFieldValues: TaskEvidenceFieldValues = {};

/**
 * 框架保留键命名空间：上传元数据 fields 与表单字段共用一层 Record，
 * 凝结核 spec 可以声明任意 key（包括 notes/stage 这类通用词）。
 * 框架自带的阶段名与通用备注必须加前缀，避免与 spec 键互相污染。
 */
export const FRAMEWORK_METADATA_PREFIX = "uvp_framework_";
export const FRAMEWORK_STAGE_FIELD_KEY = `${FRAMEWORK_METADATA_PREFIX}stage`;
export const FRAMEWORK_NOTES_FIELD_KEY = `${FRAMEWORK_METADATA_PREFIX}notes`;

/**
 * 必填检查：文本/日期槽位按 key 检查字段值，文件槽位按上传结果检查。
 * 标签直接使用凝结核配置提供的 label，框架不维护任何标签表。
 */
export function missingTaskEvidenceSlotLabels(
  slots: readonly TaskEvidenceSlot[],
  fieldValues: TaskEvidenceFieldValues,
  uploadedSlotKeys: readonly string[]
): readonly string[] {
  const uploaded = new Set(uploadedSlotKeys);
  const missing: string[] = [];
  for (const slot of slots) {
    if (!slot.required) {
      continue;
    }
    if (slot.inputKind === "file") {
      if (!uploaded.has(slot.key)) {
        missing.push(slot.label);
      }
      continue;
    }
    if (!(fieldValues[slot.key] ?? "").trim()) {
      missing.push(slot.label);
    }
  }
  return missing;
}

/**
 * 上传时进入指纹的元数据字段签名（trim 后非空、按 key 排序，顺序无关）。
 * 上传成功时对该组字段做快照；之后同一组字段的实时签名与上传时不一致，
 * 对应槽位即为 stale（指纹不再代表当前表单内容），fail-closed 禁止提交。
 */
export function evidenceMetadataSignature(fields: TaskEvidenceFieldValues): string {
  const entries: Array<readonly [string, string]> = [];
  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value.trim();
    if (trimmed) {
      entries.push([key, trimmed]);
    }
  }
  // 键序用码点序，与 uvp-core/uvp-protocol/uvp-order-app 的 canonical 口径一致；
  // UTF-16 码元序会让增补平面字符的键排错位，跨端指纹对不上。
  entries.sort(([left], [right]) => compareByCodePoint(left, right));
  return JSON.stringify(entries);
}

// 码点序等价 UTF-8 字节序；localeCompare 依赖 ICU/locale，同一份字段在不同
// 环境会签出不同指纹。按码点而非 UTF-16 码元比较：增补平面字符的代理对在
// 码元序里会排到 U+E000..U+FFFF 之前，偏离字节序。
function compareByCodePoint(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCode = left.codePointAt(leftIndex)!;
    const rightCode = right.codePointAt(rightIndex)!;
    if (leftCode !== rightCode) {
      return leftCode < rightCode ? -1 : 1;
    }
    leftIndex += leftCode > 0xffff ? 2 : 1;
    rightIndex += rightCode > 0xffff ? 2 : 1;
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
}

/** 槽位是否 stale：无快照（该槽位没有上传记录）恒为 false；字段签名与上传时不一致即 stale。 */
export function isEvidenceSlotStale(
  snapshot: string | undefined,
  fields: TaskEvidenceFieldValues
): boolean {
  if (snapshot === undefined) {
    return false;
  }
  return evidenceMetadataSignature(fields) !== snapshot;
}

/**
 * 视图当前展示的任务：待办卡片携带自己的 taskId 打开对应详情；
 * 选中任务不存在（如刷新后投影变化）时回退到投影给出的 activeTask，
 * 不做任何"挑第一个待办"之类的状态推断。
 */
export function resolveWorkbenchTask(
  tasks: readonly ProductTaskDTO[],
  selectedTaskId: string | undefined,
  fallback: ProductTaskDTO | undefined
): ProductTaskDTO | undefined {
  const selected = selectedTaskId
    ? tasks.find((task) => task.taskId === selectedTaskId)
    : undefined;
  return selected ?? fallback;
}

export type TaskSubmitIntent = "confirm_stage" | "reject_stage" | "raise_dispute" | "resolve_dispute";

/** 无 manifest 声明时的兜底映射：争议任务不得以 confirm_stage 提交。 */
const submitIntentByPluginKind: Readonly<Record<FulfillmentPluginKind, TaskSubmitIntent>> = {
  payment_placeholder: "confirm_stage",
  evidence_submission: "confirm_stage",
  delivery_update: "confirm_stage",
  validation_confirm: "confirm_stage",
  dispute_material: "raise_dispute"
};

/**
 * 提交意图与 uvp-order-app 同源同序：manifest 显式声明的 submit_signal intent
 * 优先（发布者声明是权威），无 manifest 声明时按能力插件类型推导。
 * 两端各自单源推导会在 manifest 与插件类型不一致时得出不同 intent。
 */
export function taskSubmitIntent(
  task: Pick<ProductTaskDTO, "addOnManifest" | "capabilityPlugin">
): TaskSubmitIntent {
  const submitActions = (task.addOnManifest?.actions ?? [])
    .filter((action) => action.actionKind === "submit_signal");
  const primary = submitActions.find((action) => action.primary) ?? submitActions[0];
  if (primary?.intent) {
    return primary.intent;
  }
  const pluginKind = task.capabilityPlugin?.pluginKind;
  return pluginKind ? submitIntentByPluginKind[pluginKind] ?? "confirm_stage" : "confirm_stage";
}

/**
 * 提交入口与确认页的动作文案由服务端随任务下发，前端不按意图推导
 * （审计裁决 #24）。取值顺序与 uvp-order-app 的 taskPrimaryActionLabel 同源：
 * manifest 主 submit_signal 动作 label（发布者声明）→ 能力插件
 * primaryActionLabel → 任务级 primaryActionLabel → 中性兜底（不含意图语义）。
 * intent 只决定提交的协议意图（taskSubmitIntent），不决定文案。
 */
export const NEUTRAL_SUBMIT_ACTION_LABEL = "提交待办结果";

export function taskSubmitActionLabel(
  task: Pick<ProductTaskDTO, "addOnManifest" | "capabilityPlugin" | "primaryActionLabel">
): string {
  const submitActions = (task.addOnManifest?.actions ?? [])
    .filter((action) => action.actionKind === "submit_signal");
  const primary = submitActions.find((action) => action.primary) ?? submitActions[0];
  const manifestLabel = primary?.label?.trim();
  if (manifestLabel) {
    return manifestLabel;
  }
  const pluginLabel = task.capabilityPlugin?.primaryActionLabel?.trim();
  if (pluginLabel) {
    return pluginLabel;
  }
  const taskLabel = task.primaryActionLabel?.trim();
  if (taskLabel) {
    return taskLabel;
  }
  return NEUTRAL_SUBMIT_ACTION_LABEL;
}

export type SubmissionPollOutcome = "confirmed" | "terminal_failure" | "pending";

/**
 * 轮询判级：只有服务端给出的明确终态才允许判失败（failed/expired/replaced），
 * 其余状态一律继续等待——交易可能仍在索引，误判失败会诱导重复提交。
 */
export function submissionPollOutcome(status: ProductSubmissionStatus): SubmissionPollOutcome {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "failed":
    case "expired":
    case "replaced":
      return "terminal_failure";
    default:
      return "pending";
  }
}

/** 终态失败文案：expired 可重投；replaced 强调以最新提交为准，不诱导盲目重投。 */
export function submissionTerminalMessage(
  status: ProductSubmissionStatus,
  errorCode?: string | undefined
): string {
  switch (status) {
    case "expired":
      return "提交已过期未生效，可重新提交";
    case "replaced":
      return "该提交已被后续提交取代，请以最新提交记录为准，请勿盲目重投";
    default:
      return errorCode ?? "提交失败，可重试";
  }
}
