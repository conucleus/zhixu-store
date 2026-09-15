import {
  lifecycleStatusForZhixu,
  validateTaskEvidenceSpec,
  type ProductResourceRequirementDTO,
  type ProductTaskDTO,
  type TaskEvidenceSpecDTO,
  type ZhixuSummaryDTO
} from "@uvp-eth/product-dto";
import type { ProductSubmissionStatus } from "../api";
import type { SubmitMachineStatus } from "./workbenchTypes";
import {
  EVIDENCE_MAX_FILE_BYTES,
  FRAMEWORK_METADATA_PREFIX,
  acceptAllowsFile,
  acceptAttribute,
  acceptHint,
  acceptIncludesPdf,
  emptyEvidenceFieldValues,
  evidenceMetadataSignature,
  formatAcceptLabel,
  isEvidenceSlotStale,
  missingEvidenceSlotLabels,
  planTaskEvidenceMergedSpecAndResources,
  validateEvidenceFileForSlot as sharedValidateEvidenceFileForSlot
} from "../../shared/chain/evidence/planner";
import type {
  EvidenceFileLike,
  EvidenceFileMetadata,
  EvidencePlan,
  EvidencePlanSlot,
  EvidenceValidationTexts
} from "../../shared/chain/evidence/planner";
import { advanceScopeGeneration, scopeGenerationValue } from "../../shared/chain/submission/scope-guard";
import type { ScopeGeneration } from "../../shared/chain/submission/scope-guard";

export {
  // 证据槽位机（accept 约束/文件校验/指纹签名）与作用域代数已上收
  // chain 轨单源（shared/chain），本文件按原导入路径 re-export，调用点
  // 不感知；planTaskEvidence 保留本端包装（合并策略，见下）。
  EVIDENCE_MAX_FILE_BYTES,
  FRAMEWORK_METADATA_PREFIX,
  acceptAllowsFile,
  acceptAttribute,
  acceptHint,
  acceptIncludesPdf,
  emptyEvidenceFieldValues,
  evidenceMetadataSignature,
  formatAcceptLabel,
  isEvidenceSlotStale,
  advanceScopeGeneration,
  scopeGenerationValue
};
export type { EvidenceFileMetadata, ScopeGeneration };

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
 * 以及任务投影下发的结构化资源要求（与 spec 合并进同一待办视图）。
 */
export interface TaskEvidencePlanInput {
  readonly evidenceSpec?: readonly TaskEvidenceSpecDTO[] | undefined;
  readonly resourceRequirements?: readonly ProductResourceRequirementDTO[] | undefined;
}

export type TaskEvidenceSlotInputKind = "file" | "text" | "date";

/** 渲染层的一个证据槽位：结构即 chain 轨共享 EvidencePlanSlot（本端别名）。 */
export type TaskEvidenceSlot = EvidencePlanSlot;

export type TaskEvidencePlan = EvidencePlan;

/**
 * 把任务的证据要求解析为可渲染槽位（文档《证据与存证规则》§二.2 的合并
 * 去重视图，本端策略 = chain 轨 planTaskEvidenceMergedSpecAndResources）：
 * 结构化 spec 与服务端资源要求并存时两者都进上传槽位；同一
 * documentType 只保留一个槽位（spec 声明优先），重复槽位会强迫参与者
 * 对同一份凭证上传两次。spec 缺失或非法时保留服务端结构化资源要求
 * 槽位（metadata 型除外）。uvp-order-app 用的是另一策略（合法 spec ⇒
 * 仅 spec 槽位的单轨视图，planTaskEvidenceSpecOrFallback）——有意分叉，
 * 勿对齐（见 shared/chain/evidence/planner.ts 头注）。
 *
 * 框架红线：商店不含业务标签匹配表。spec 与资源要求都不存在时没有证据
 * 槽位（纯字段确认或按业务约定线下提交），不臆造通用槽位，也不在上传前拒绝。
 */
export function planTaskEvidence(task: TaskEvidencePlanInput): TaskEvidencePlan {
  return planTaskEvidenceMergedSpecAndResources({
    ...(task.evidenceSpec !== undefined ? { spec: task.evidenceSpec } : {}),
    ...(task.resourceRequirements !== undefined
      ? {
          resources: task.resourceRequirements.map((resource) => ({
            resourceId: resource.resourceId,
            // 去重键是 documentType（进入服务端指纹的证据类型），不是前端
            // 槽位 key：spec 的 documentType 是 spec key，资源槽位的是
            // resourceType ?? resourceId。
            documentType: resource.resourceType ?? resource.resourceId,
            label: resource.label,
            required: resource.required
          }))
        }
      : {}),
    validateSpec: validateTaskEvidenceSpec
  });
}

/** 上传前校验（chain 轨单源）：本端文案即 chain 轨默认文案（另一端自带 texts）。 */
export function validateEvidenceFileForSlot(
  file: EvidenceFileLike,
  slot: Pick<TaskEvidenceSlot, "accept">,
  texts?: EvidenceValidationTexts
): Promise<string | undefined> {
  return sharedValidateEvidenceFileForSlot(file, slot, texts);
}

/** 上传元数据里随文件上送的字段值（key 来自 spec，框架不含具体 key）。 */
export type TaskEvidenceFieldValues = Readonly<Record<string, string>>;

export const emptyTaskEvidenceFieldValues: TaskEvidenceFieldValues = emptyEvidenceFieldValues;

/**
 * 框架保留键命名空间已上收 chain 轨（FRAMEWORK_METADATA_PREFIX）；
 * 本端阶段名与通用备注键从该前缀派生，避免与 spec 键互相污染。
 */
export const FRAMEWORK_STAGE_FIELD_KEY = `${FRAMEWORK_METADATA_PREFIX}stage`;
export const FRAMEWORK_NOTES_FIELD_KEY = `${FRAMEWORK_METADATA_PREFIX}notes`;

/**
 * 必填检查（chain 轨单源）：文本/日期槽位按 key 检查字段值，文件槽位按
 * 上传结果检查。标签直接使用凝结核配置提供的 label，框架不维护任何标签表。
 */
export const missingTaskEvidenceSlotLabels = missingEvidenceSlotLabels;

/** 视图当前展示的任务：待办卡片携带自己的 taskId 打开对应详情；
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

/**
 * 邀请链接的 uvp-order-app 基地址：只认部署配置注入（VITE_UVP_ORDER_APP_URL）。
 * ?invite=&inviteToken= 的消费逻辑只存在于 uvp-order-app，本仓任何页面都不读
 * 这组参数——缺配置时回落本站 origin 只会产出打不开的死链，还把一次性令牌
 * 泄露给无关域名，因此 fail-closed 显式抛错（stateMachineSignExpectation 同范式）。
 */
export function resolveOrderAppInviteBaseUrl(baseUrl?: string): string {
  const origin = baseUrl?.trim() ||
    (import.meta.env?.VITE_UVP_ORDER_APP_URL as string | undefined)?.trim();
  if (!origin) {
    throw new Error("邀请链接基地址未配置（构建期环境变量 VITE_UVP_ORDER_APP_URL，指向 uvp-order-app 部署地址），已拒绝生成邀请链接");
  }
  return origin;
}

/**
 * 邀请链接（发送给受邀参与方）：一次性 token 由服务端在创建响应中下发一次，
 * 链接必须带 ?invite=&inviteToken=（uvp-order-app 入口格式，accept/reject/
 * preview 都按 token 哈希比对）。基地址缺配置即抛错，不生成看似可用的死链。
 */
export function inviteLinkForInvite(
  inviteId: string,
  inviteToken: string,
  baseUrl?: string
): string {
  const origin = resolveOrderAppInviteBaseUrl(baseUrl);
  const params = new URLSearchParams({ invite: inviteId, inviteToken });
  return `${origin.replace(/\/+$/u, "")}/?${params.toString()}`;
}

// 任务提交意图（写侧契约，治理审计 §1.1 P1-1）：TaskSubmitIntent 联合、
// submitIntentByPluginKind 兜底映射与 taskSubmitIntent 推导以 product-dto
// 写侧面为唯一出处——与 uvp-order-app 的逐字镜像随之消除，两端不再可能
// 各自漂移。raise_dispute 是服务端 PrepareProductTaskSubmitInput.intent
// 词表成员：争议入口前端已删（678a2da），但服务端契约仍接受该 intent，
// 联合不得收缩。
export {
  submitIntentByPluginKind,
  taskSubmitIntent,
  type TaskSubmitIntent
} from "@uvp-eth/product-dto";

/**
 * 提交入口与确认页的动作文案由服务端随任务下发，前端不按意图推导。
 * 取值顺序与 uvp-order-app 的 taskPrimaryActionLabel 同源：
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

/**
 * 签名域交叉核对的预期值独立来源：构建期部署配置注入（Vite 内联的静态
 * import.meta.env 成员），不来自被核对的同一 BFF 响应——被攻陷的 BFF 可以
 * 让 typedData.domain 与任务投影/prepare 信封自洽，但改不了部署配置。
 * 与 uvp-order-app 的 submitSignExpectation 同范式；缺预期值即拒绝签名
 * （fail-closed），不再条件性跳过比对。
 */
export interface SignDomainEnv {
  readonly VITE_UVP_STATE_MACHINE_ADDRESS?: string | undefined;
}

export function stateMachineSignExpectation(env: SignDomainEnv = buildTimeSignDomainEnv()): {
  readonly verifyingContract: string;
} {
  const address = env.VITE_UVP_STATE_MACHINE_ADDRESS?.trim();
  if (!address || !/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new Error("状态机部署地址未配置（构建期环境变量 VITE_UVP_STATE_MACHINE_ADDRESS），无法交叉核对签名域，已拒绝签名");
  }
  return { verifyingContract: address };
}

function buildTimeSignDomainEnv(): SignDomainEnv {
  return {
    VITE_UVP_STATE_MACHINE_ADDRESS: import.meta.env?.VITE_UVP_STATE_MACHINE_ADDRESS
  };
}

/**
 * 提交入口终态门：DTO 的 status/canSubmit 是服务端权威门（已关闭/待索引/
 * 受阻任务不呈现可提交入口，order-app 同功能面 fail-closed），submitStatus
 * confirmed 是本次会话的终态闸——提交确认后不得再触发完整签名提交，除非
 * 刷新后的投影把任务改回 open（新会话/新状态）。
 */
export function canSubmitWorkbenchTask(
  task: Pick<ProductTaskDTO, "status" | "canSubmit">,
  submitStatus: SubmitMachineStatus
): boolean {
  if (task.status !== "open" || task.canSubmit === false) {
    return false;
  }
  return submitStatus !== "confirmed";
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

// 作用域代数（ScopeGeneration / advanceScopeGeneration /
// scopeGenerationValue）已上收 chain 轨（shared/chain/submission/scope-guard），
// 上文 re-export；本端 useOrderDraftFlow / useOrderRegistrationFlow /
// useTaskSubmissionFlow 经本文件消费，导入路径不变。
