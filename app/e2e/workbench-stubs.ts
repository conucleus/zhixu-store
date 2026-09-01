import type { Page } from "@playwright/test";
import { customsDemoTaskConfig } from "../src/product/demo/customs-demo-config";

/**
 * page.route 测试桩：把 /product/* 响应注入到浏览器请求上。
 * 生产应用不再有 demo/样例数据源；e2e 需要的目录与身份一律由这些桩提供。
 * 演示任务的证据配置来自演示配置数据文件（等同某凝结核自带配置），
 * 商店核心代码按 evidenceSpec 通用渲染。
 */

/** 与 playwright.config.ts 中 VITE_UVP_CHAIN_SERVICES_URL 一致的不可达地址。 */
export const STUB_API_BASE = "http://127.0.0.1:9";

export const stubZhixu = {
  zhixuId: "zhixu-cross-border-high-value",
  title: "跨境高价值货物履约秩序",
  subtitle: "买家、卖家、报关、物流、检验方按同一套阶段推进",
  reviewStatus: "approved",
  reviewLabel: "共同秩序审核通过",
  riskLevel: "中",
  applicableBusiness: ["平行出口车", "工业设备", "高价值货物"],
  excludedBusiness: ["危险品", "活体动物"],
  stageCount: 3,
  roleSlotCount: 5,
  supportedPaymentMethods: ["USDC", "USDT"],
  maintainer: "平台维护方",
  updatedAt: "2026-01-01T00:00:00.000Z",
  planPublication: {
    status: "published",
    label: "计划已发布并锚定",
    stateMachineLabel: "状态机已部署",
    planId: "0xplan0000000000000000000000000000000000000000000000000000000001",
    planHash: "0xhash0000000000000000000000000000000000000000000000000000000001"
  },
  roleSlots: [
    { slotId: "funds", title: "资金方", label: "付款与保障", duty: "确认付款条件", evidence: ["职责确认"], status: "required", tone: "info", required: true },
    { slotId: "supply", title: "卖家", label: "供货方", duty: "按约交付货物", evidence: ["职责确认"], status: "required", tone: "ok", required: true },
    { slotId: "delivery", title: "报关物流", label: "跨境履约", duty: "完成报关与运输", evidence: ["报关单"], status: "connected", tone: "ok", required: true },
    { slotId: "validation", title: "检验方", label: "验收确认", duty: "验收货物", evidence: ["验收单"], status: "optional", tone: "neutral", required: false }
  ],
  dockableModules: [
    { moduleId: "funds-protection", title: "资金保障", desc: "付款条件由订单状态约束", ports: ["付款确认"], status: "available" }
  ],
  stages: [
    { stageId: "stage-export-customs", index: 1, name: "出口报关", evidence: ["报关单"], ownerRole: "报关物流", status: "active" },
    { stageId: "stage-delivery", index: 2, name: "国际运输", evidence: ["提单"], ownerRole: "报关物流", status: "pending" },
    { stageId: "stage-validation", index: 3, name: "验收确认", evidence: ["验收单"], ownerRole: "检验方", status: "pending" }
  ],
  orderPermissionTable: [],
  proofRows: [{ label: "计划哈希", value: "0xhash0000000000000000000000000000000000000000000000000000000001" }],
  createOrderHint: "所有参与方确认职责后即可启动订单。",
  createOrderTrigger: { source: "order-draft", signalName: "trigger", triggerHookId: "hook", triggerStageId: "stage-export-customs", submitterRoleSlotId: "delivery" }
} as const;

export const stubParticipant = {
  participantId: "wallet:0xabc0000000000000000000000000000000000001",
  displayName: "测试报关行操作员",
  roleLabels: ["报关行"],
  source: "wallet"
};

export const stubOrder = {
  orderId: "order-1001",
  zhixuId: stubZhixu.zhixuId,
  title: "测试采购订单（e2e 桩）",
  status: "registered",
  statusLabel: "进行中",
  totalAmount: { amount: "10000", currency: "USDC", display: "10,000 USDC" },
  fundingStatus: "付款条件已确认",
  currentStageId: "stage-export-customs",
  currentStageName: "出口报关",
  currentTaskTitle: "提交出口报关凭证",
  currentTaskSummary: "上传报关单后进入下一阶段",
  stages: stubZhixu.stages,
  participants: [
    { participantId: "customs", role: "报关物流", duty: "完成报关", evidence: ["报关单"], status: "joined", tone: "ok" }
  ],
  recentEvents: [
    { eventId: "event-1", text: "订单已创建", time: "2026-01-01 08:00" }
  ],
  proofRows: [{ label: "订单记录", value: "order-1001" }]
};

export const stubTask = {
  taskId: "task-2001",
  orderId: stubOrder.orderId,
  orderTitle: stubOrder.title,
  zhixuId: stubZhixu.zhixuId,
  title: "提交出口报关凭证",
  subtitle: "你代表报关物流，需要提交本阶段凭证。",
  assigneeRole: "报关物流",
  stageId: "stage-export-customs",
  stageName: "出口报关",
  deadline: "2026-12-31",
  fundingImpact: "确认后释放本阶段付款",
  requiredEvidence: ["报关单 PDF", "报关单号", "出口港口", "完成时间"],
  evidenceSpec: customsDemoTaskConfig.evidenceSpec,
  status: "open",
  participantRoleLabel: "报关物流",
  primaryActionLabel: "处理待办",
  responsibilityStatements: [
    { title: "凭证真实", desc: "我确认上传的凭证真实有效。" }
  ],
  proofRows: [{ label: "任务记录", value: "task-2001" }]
};

/** 无结构化配置的降级任务：商店必须按通用槽位渲染，不得拒绝或丢弃声明。 */
export const stubFallbackTask = {
  ...stubTask,
  taskId: "task-2002-fallback",
  title: "提交阶段凭证（无结构化配置）",
  requiredEvidence: ["质检单", "物流回单"],
  evidenceSpec: undefined
};

export const stubDraft = {
  draftId: "draft-3001",
  zhixuId: stubZhixu.zhixuId,
  planId: stubZhixu.planPublication.planId,
  planHash: stubZhixu.planPublication.planHash,
  title: "e2e 桩订单",
  businessType: "车辆",
  goods: ["品牌型号：测试车型"],
  totalAmount: "10000",
  currency: "USDC",
  exportRegion: "中国",
  destinationRegion: "阿联酋",
  expectedCompletionDate: "2026-07-31",
  notes: "",
  status: "awaiting_participants",
  createdBy: "e2e",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

export const stubParticipants = [
  {
    participantId: `${stubDraft.draftId}-funds`,
    draftId: stubDraft.draftId,
    roleSlotId: "funds",
    roleLabel: "资金方",
    displayName: "",
    contact: "",
    status: "accepted",
    required: true
  },
  {
    participantId: `${stubDraft.draftId}-supply`,
    draftId: stubDraft.draftId,
    roleSlotId: "supply",
    roleLabel: "卖家",
    displayName: "",
    contact: "",
    status: "missing",
    required: true
  },
  {
    participantId: `${stubDraft.draftId}-delivery`,
    draftId: stubDraft.draftId,
    roleSlotId: "delivery",
    roleLabel: "报关物流",
    displayName: "",
    contact: "",
    status: "missing",
    required: true
  }
];

export const stubInvite = {
  inviteId: "invite-4001",
  draftId: stubDraft.draftId,
  participantId: "draft-3001-supply",
  roleSlotId: "supply",
  tokenHash: "0xtoken",
  status: "active",
  expiresAt: "2026-12-31T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  inviteUrl: "/?invite=invite-4001"
};

export const stubEvidence = {
  evidenceId: "evidence-5001",
  orderId: stubOrder.orderId,
  taskId: stubTask.taskId,
  stageIdentifier: stubTask.stageId,
  ownerParticipantId: "wallet:0xabc0000000000000000000000000000000000001",
  fileName: "出口报关单.pdf",
  mimeType: "application/pdf",
  size: 1024,
  storageURI: "store://evidence/evidence-5001",
  contentHash: "0xcontent",
  metadataHash: "0xmetadata",
  payloadHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  payloadRef: "store://payload/evidence-5001",
  status: "uploaded",
  createdAt: "2026-01-01T00:00:00.000Z"
};

export const stubPreparedSubmit = {
  prepareId: "prepare-6001",
  taskId: stubTask.taskId,
  expiresAt: "2026-01-01T01:00:00.000Z",
  humanSummary: {
    orderId: stubOrder.title,
    stage: stubTask.stageName,
    action: "确认本阶段完成",
    payloadHash: stubEvidence.payloadHash,
    submitter: "0xabc0000000000000000000000000000000000001",
    validUntil: "2026-01-01T01:00:00.000Z"
  },
  // 与 protocol-bindings buildProductSubmitTypedData 的真实结构一致：
  // 前端签名前会校验 primaryType/domain/submitter，桩数据必须能通过校验。
  typedData: {
    domain: {
      name: "UVPStateMachine",
      version: "0.8",
      chainId: 31337,
      verifyingContract: "0x0000000000000000000000000000000000000001"
    },
    types: { UVPStateMachineSignal: [] },
    primaryType: "UVPStateMachineSignal",
    message: {
      submitter: "0xabc0000000000000000000000000000000000001"
    }
  }
};

export const stubSubmission = {
  submissionId: "submission-7001",
  taskId: stubTask.taskId,
  status: "confirmed",
  statusLabel: "已确认",
  txHash: `0x${"11".repeat(32)}`,
  blockNumber: "18734562",
  retryable: false,
  proofRows: [{ label: "交易编号", value: `0x${"11".repeat(32)}` }]
};

export interface RouteOverride {
  readonly status?: number;
  readonly body?: unknown;
}

export interface WorkbenchStubOptions {
  /** 按路径前缀覆盖默认桩响应；用于模拟接口故障。 */
  readonly overrides?: Readonly<Record<string, RouteOverride>>;
}

function matchOverride(pathname: string, overrides: WorkbenchStubOptions["overrides"]): RouteOverride | undefined {
  const entries = Object.entries(overrides ?? {});
  // 最长前缀优先："/product/zhixus/<id>" 的覆盖不会被子列表前缀 "/product/zhixus" 抢先匹配
  entries.sort(([left], [right]) => right.length - left.length);
  for (const [prefix, override] of entries) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return override;
    }
  }
  return undefined;
}

async function fulfillJson(route: { fulfill(options: { status: number; contentType: string; body: string }): Promise<void> }, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** 安装 /product/** 页面级路由桩。未匹配的 /product 请求按 404 返回。 */
export async function installWorkbenchRoutes(page: Page, options: WorkbenchStubOptions = {}): Promise<void> {
  const overrides = options.overrides;
  let inviteSequence = 1;
  // glob 必须锚定到桩 API 的 origin（127.0.0.1:9）。若写成 "**\/product/**"，
  // 会连 Vite 开发服务器自身的 /src/product/*.ts 模块请求一起拦截，
  // 应用模块被 JSON 桩替换后页面直接白屏。
  await page.route(`${STUB_API_BASE}/product/**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const override = matchOverride(pathname, overrides);
    if (override) {
      await fulfillJson(route, override.body ?? {}, override.status ?? 200);
      return;
    }

    if (pathname === "/product/zhixus" && method === "GET") {
      await fulfillJson(route, { zhixus: [stubZhixu] });
      return;
    }
    if (pathname.startsWith("/product/zhixus/") && method === "GET") {
      await fulfillJson(route, { zhixu: stubZhixu });
      return;
    }
    if (pathname === "/product/orders" && method === "GET") {
      await fulfillJson(route, { orders: [stubOrder] });
      return;
    }
    if (pathname === "/product/tasks" && method === "GET") {
      await fulfillJson(route, { tasks: [stubTask] });
      return;
    }
    if (pathname === "/product/me" && method === "GET") {
      await fulfillJson(route, { participant: stubParticipant });
      return;
    }
    if (pathname === "/product/order-drafts" && method === "POST") {
      const request = route.request().postDataJSON() as { readonly title?: string };
      await fulfillJson(route, { draft: { ...stubDraft, title: request?.title ?? stubDraft.title } });
      return;
    }
    if (pathname.startsWith("/product/order-drafts/") && pathname.endsWith("/prepare-trigger") && method === "POST") {
      await fulfillJson(route, {
        prepared: {
          prepareId: "prepare-order-8001",
          triggerId: "trigger-order-8001",
          draftId: stubDraft.draftId,
          orderId: stubOrder.orderId,
          expiresAt: "2026-01-01T01:00:00.000Z",
          submitter: "0xabc0000000000000000000000000000000000001",
          typedData: {
            domain: {
              name: "UVPStateMachine",
              version: "0.8",
              chainId: 31337,
              verifyingContract: "0x0000000000000000000000000000000000000001"
            },
            types: { UVPStateMachineTriggerOrderFromOutside: [] },
            primaryType: "UVPStateMachineTriggerOrderFromOutside",
            message: {
              submitter: "0xabc0000000000000000000000000000000000001"
            }
          }
        }
      });
      return;
    }
    if (pathname.startsWith("/product/order-drafts/") && pathname.endsWith("/trigger") && method === "POST") {
      await fulfillJson(route, { draft: { ...stubDraft, status: "triggered", triggeredOrderId: stubOrder.orderId } });
      return;
    }
    if (/^\/product\/order-drafts\/[^/]+$/.test(pathname)) {
      if (method === "PATCH") {
        const patch = route.request().postDataJSON() as Record<string, unknown>;
        await fulfillJson(route, { draft: { ...stubDraft, ...patch } });
        return;
      }
      await fulfillJson(route, { draft: stubDraft });
      return;
    }
    if (/^\/product\/orders\/[^/]+\/invites$/.test(pathname) && method === "POST") {
      inviteSequence += 1;
      await fulfillJson(route, { invite: { ...stubInvite, inviteId: `invite-${4000 + inviteSequence}` } });
      return;
    }
    if (/^\/product\/orders\/[^/]+\/participants$/.test(pathname) && method === "GET") {
      await fulfillJson(route, { participants: stubParticipants });
      return;
    }
    if (/^\/product\/invites\/[^/]+\/(accept|reject)$/.test(pathname) && method === "POST") {
      await fulfillJson(route, { invite: { ...stubInvite, status: pathname.endsWith("accept") ? "accepted" : "rejected" } });
      return;
    }
    if (pathname === "/product/evidence" && method === "POST") {
      await fulfillJson(route, { evidence: stubEvidence });
      return;
    }
    if (/^\/product\/evidence\/[^/]+$/.test(pathname) && method === "GET") {
      await fulfillJson(route, { evidence: stubEvidence });
      return;
    }
    if (/^\/product\/evidence\/[^/]+\/proof$/.test(pathname) && method === "GET") {
      await fulfillJson(route, {
        proof: {
          payloadHash: stubEvidence.payloadHash,
          contentHash: stubEvidence.contentHash,
          metadataHash: stubEvidence.metadataHash,
          verificationStatus: "unbound"
        }
      });
      return;
    }
    if (/^\/product\/tasks\/[^/]+\/prepare-submit$/.test(pathname) && method === "POST") {
      await fulfillJson(route, stubPreparedSubmit);
      return;
    }
    if (/^\/product\/tasks\/[^/]+\/submit$/.test(pathname) && method === "POST") {
      await fulfillJson(route, stubSubmission);
      return;
    }
    if (/^\/product\/submissions\/[^/]+$/.test(pathname) && method === "GET") {
      await fulfillJson(route, stubSubmission);
      return;
    }

    await fulfillJson(route, { error: "not_found" }, 404);
  });
}
