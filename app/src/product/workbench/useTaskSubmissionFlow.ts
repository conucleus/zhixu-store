import { useLayoutEffect, useRef, useState } from "react";
import { PRODUCT_SUBMIT_DOMAIN_VERSION } from "@uvp-eth/protocol-bindings";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type {
  EvidenceObjectDTO,
  EvidenceProofDTO,
  PreparedSubmitDTO,
  ProductApiClient,
  ProductApiSource
} from "../api";
import {
  requestWalletAccount,
  signTypedData,
  WalletNotConnectedError,
  WalletRejectedError
} from "../wallet";
import { idleAction, type ActionState, type SubmitMachineState } from "./workbenchTypes";
import {
  FRAMEWORK_STAGE_FIELD_KEY,
  advanceScopeGeneration,
  canSubmitWorkbenchTask,
  delay,
  evidenceMetadataSignature,
  isEvidenceSlotStale,
  missingTaskEvidenceSlotLabels,
  planTaskEvidence,
  readableError,
  scopeGenerationValue,
  stateMachineSignExpectation,
  submissionPollOutcome,
  submissionTerminalMessage,
  taskSubmitIntent,
  validateEvidenceFileForSlot,
  type ScopeGeneration,
  type TaskEvidenceFieldValues,
  type TaskEvidencePlan
} from "./workbenchSupport";

/** 已上传证据按槽位 key 归档；框架不预置任何业务槽位。 */
export type EvidenceBySlot = Readonly<Record<string, EvidenceObjectDTO>>;
export type EvidenceProofsBySlot = Readonly<Record<string, EvidenceProofDTO>>;
/** 每个已上传槽位在上传时刻的元数据字段快照（JSON），用于检测后续字段变更。 */
export type FieldSnapshotsBySlot = Readonly<Record<string, string>>;

export function useTaskSubmissionFlow(input: {
  readonly api: ProductApiClient;
  readonly activeTask?: ProductTaskDTO | undefined;
  /** 当前凭证字段值：上传时进入指纹快照，也是提交门槛与 stale 判定的实时依据。 */
  readonly fieldValues: TaskEvidenceFieldValues;
  /** 成功 mutation（上传/提交确认）后触发一次定向刷新；由调用方提供，钩子内部不循环调用。 */
  readonly onMutationSuccess?: () => void;
}): {
  readonly evidencePlan: TaskEvidencePlan;
  readonly evidenceBySlot: EvidenceBySlot;
  readonly evidenceProofsBySlot: EvidenceProofsBySlot;
  /** 上传后相关字段发生变更的槽位标签：存在 stale 槽位时禁止提交。 */
  readonly staleSlotLabels: readonly string[];
  /** 已上传但未取到核验记录（proof 拉取失败）的槽位标签：禁止提交。 */
  readonly unverifiedSlotLabels: readonly string[];
  readonly evidenceAction: ActionState;
  /** 正在上传中的槽位 key：槽位级串行化守卫的渲染面（file input 禁用）。 */
  readonly uploadingSlotKeys: readonly string[];
  readonly submitMachine: SubmitMachineState;
  readonly handleUploadEvidence: (slotKey: string, file: File) => Promise<void>;
  readonly handleConfirmSubmit: () => Promise<void>;
} {
  const { api, activeTask, fieldValues, onMutationSuccess } = input;
  const evidencePlan = planTaskEvidence({
    evidenceSpec: activeTask?.evidenceSpec,
    resourceRequirements: activeTask?.resourceRequirements
  });
  const [evidenceBySlot, setEvidenceBySlot] = useState<EvidenceBySlot>({});
  const [proofsBySlot, setProofsBySlot] = useState<EvidenceProofsBySlot>({});
  const [fieldSnapshotsBySlot, setFieldSnapshotsBySlot] = useState<FieldSnapshotsBySlot>({});
  const [evidenceAction, setEvidenceAction] = useState<ActionState>(idleAction);
  const [uploadingSlotKeys, setUploadingSlotKeys] = useState<readonly string[]>([]);
  const [submitMachine, setSubmitMachine] = useState<SubmitMachineState>({
    status: "idle",
    message: "等待上传凭证并确认提交"
  });
  const submitInflightRef = useRef(false);
  // 同槽上传串行化（uvp-order-app EvidencePanel 同款防护）：同槽位先选大
  // 文件 A 再选小文件 B 时，B 先返回、A 后返回会覆盖槽位，最终提交的不是
  // 参与者最后选择的文件。ref 是同步判定的真源（连续选择发生在重渲染前），
  // state 只镜像给渲染层禁用 file input。
  const uploadingSlotsRef = useRef<ReadonlySet<string>>(new Set());

  function markSlotUploading(slotKey: string, uploading: boolean): void {
    const next = new Set(uploadingSlotsRef.current);
    if (uploading) {
      next.add(slotKey);
    } else {
      next.delete(slotKey);
    }
    uploadingSlotsRef.current = next;
    setUploadingSlotKeys([...next]);
  }

  const taskScopeKey = activeTask
    ? `${activeTask.orderId}:${activeTask.taskId}:${activeTask.stageId}`
    : "none";
  // 作用域键在 A→B→A 回切时会复用：按裸键比较的 stale 检查在回切后
  // "键又对上了"，旧作用域的在途请求（上传/提交/轮询）续作通过检查，把旧
  // 结果写回当前视图。代数单调递增且从不复用（useOrderDraftFlow /
  // useOrderRegistrationFlow 同方案），作用域值 = 键+代数，回切得到新值。
  const generationRef = useRef<ScopeGeneration<string | undefined>>({ key: taskScopeKey, generation: 1 });
  generationRef.current = advanceScopeGeneration(generationRef.current, taskScopeKey);
  const effectiveScopeKey = scopeGenerationValue(generationRef.current);
  const taskScopeRef = useRef(effectiveScopeKey);
  useLayoutEffect(() => {
    taskScopeRef.current = effectiveScopeKey;
    setEvidenceBySlot({});
    setProofsBySlot({});
    setFieldSnapshotsBySlot({});
    setEvidenceAction(idleAction);
    setSubmitMachine({ status: "idle", message: "等待上传凭证并确认提交" });
    // 作用域切换不这里清 uploadingSlotsRef：旧作用域的在途上传会在下一个
    // 作用域检查点自行作废，其 finally 负责释放槽位；提前清掉会让新作用域
    // 对同 key 槽位并发起传，随后旧请求的 finally 又误删新请求的占用标记。
  }, [effectiveScopeKey]);
  // fail-closed：上传时把表单字段快照进指纹，之后任何相关字段变更都会让对应槽位过期。
  const staleSlotLabels = Object.keys(evidenceBySlot)
    .filter((key) => isEvidenceSlotStale(fieldSnapshotsBySlot[key], fieldValues))
    .map((key) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);
  // 已上传但没有核验记录（proof 拉取失败）的槽位：核验防线看不见它，
  // 与 stale 一样禁锁提交，不得静默放行。
  const unverifiedSlotLabels = Object.keys(evidenceBySlot)
    .filter((key) => !proofsBySlot[key])
    .map((key) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);

  async function handleUploadEvidence(
    slotKey: string,
    file: File
  ): Promise<void> {
    const slot = evidencePlan.slots.find((item) => item.key === slotKey);
    if (!activeTask || !slot) {
      setEvidenceAction({ phase: "error", message: "暂无可处理的待办" });
      return;
    }
    // 槽位级串行化守卫：上传（含本地校验与核验拉取）进行中拒绝再选文件。
    // 静默返回不覆盖第一次上传的 pending 提示（uvp-order-app 同款），
    // 晚到的旧上传由此不再有机会覆盖参与者最后选择的文件。
    if (uploadingSlotsRef.current.has(slotKey)) {
      return;
    }
    // 元数据会随上传进入指纹：必填的文本/日期字段缺失时在上传前拦截。
    const uploadedKeys = Object.keys(evidenceBySlot);
    const slotMissing = missingTaskEvidenceSlotLabels(
      evidencePlan.slots.filter((item) => item.inputKind !== "file"),
      fieldValues,
      uploadedKeys
    );
    if (slotMissing.length > 0) {
      setEvidenceAction({ phase: "error", message: `请填写必填字段：${slotMissing.join("、")}` });
      return;
    }
    markSlotUploading(slotKey, true);
    const requestScopeKey = taskScopeRef.current;
    try {
      const fileError = await validateEvidenceFileForSlot(file, slot);
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      if (fileError) {
        setEvidenceAction({ phase: "error", message: fileError });
        return;
      }
      setEvidenceAction({ phase: "pending", message: "正在上传凭证并生成指纹" });
      const metadataFields: Record<string, string> = {
        // 框架保留键带命名空间前缀，不与凝结核 spec 的任意 key 冲突。
        [FRAMEWORK_STAGE_FIELD_KEY]: activeTask.stageName
      };
      // 字段 key 全部来自凝结核配置（spec），框架不携带任何业务字段名。
      for (const [key, value] of Object.entries(fieldValues)) {
        const trimmed = value.trim();
        if (trimmed) {
          metadataFields[key] = trimmed;
        }
      }
      const result = await api.uploadEvidence({
        file,
        orderId: activeTask.orderId,
        taskId: activeTask.taskId,
        stageIdentifier: activeTask.stageId,
        documentType: slot.documentType,
        metadata: {
          businessLabel: slot.label,
          documentType: slot.documentType,
          fields: metadataFields
        }
      });
      // A task switch while the request was in flight must not repopulate the
      // next task's evidence map with the previous task's evidence ID.
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      setEvidenceBySlot((current) => ({ ...current, [slot.key]: result.data }));
      // 快照与证据同进同退：指纹由上传时刻的字段参与生成，只落证据不落快照
      // 会让该槽位绕过 stale 判定（无快照恒为不过期）。
      setFieldSnapshotsBySlot((current) => ({
        ...current,
        [slot.key]: evidenceMetadataSignature(fieldValues)
      }));
      let proofResult: Awaited<ReturnType<typeof api.getEvidenceProof>>;
      try {
        proofResult = await api.getEvidenceProof(result.data.evidenceId);
      } catch (proofError) {
        if (taskScopeRef.current !== requestScopeKey) {
          return;
        }
        // 核验记录拉取失败（含服务端拒绝给出核验结果的路径）时，槽位停在
        // "已上传但未确认"：提交门槛按未确认禁锁，不得在无核验记录时放行。
        setEvidenceAction({ phase: "error", message: readableError(proofError, "凭证核验状态获取失败，请重新上传该凭证") });
        return;
      }
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      // 证据核验态与上传归档统一按槽位 key 记录，渲染层按同一 key 读取。
      setProofsBySlot((current) => ({ ...current, [slot.key]: proofResult.data }));
      setEvidenceAction({ phase: "success", message: "凭证已上传，指纹已生成", source: result.source });
      onMutationSuccess?.();
    } catch (error) {
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      setEvidenceAction({ phase: "error", message: readableError(error, "凭证上传失败") });
    } finally {
      markSlotUploading(slotKey, false);
    }
  }

  async function handleConfirmSubmit(): Promise<void> {
    // 连击互斥：提交是 prepare→签名→上链→轮询的长链路，按钮的 pending 禁用
    // 要等状态落盘+重渲染才生效，同步 ref 互斥挡住重渲染前的第二次点击
    // （服务端 first-writer-wins 只是兜底，不能依赖）。
    if (submitInflightRef.current) {
      return;
    }
    if (!activeTask) {
      setSubmitMachine({ status: "failed", message: "暂无可提交的待办" });
      return;
    }
    // 终态门（fail-closed）：投影任务状态不是 open 或钱包无提交权时拒绝
    // 进入签名链路——confirmed 后的重复提交在这里被硬闸住，不再依赖按钮
    // 状态；入口禁用（canSubmitWorkbenchTask）只是第一道防线。
    if (!canSubmitWorkbenchTask(activeTask, submitMachine.status)) {
      setSubmitMachine({
        status: "failed",
        message: activeTask.status === "submitted"
          ? "已提交，正在等待链上确认，请勿重复提交"
          : activeTask.status === "done"
            ? "该待办已确认完成"
            : activeTask.canSubmit === false
              ? "当前钱包暂不能提交此待办"
              : (activeTask.blockedReason ?? "当前待办不可提交")
      });
      return;
    }
    const requestScopeKey = taskScopeRef.current;
    const uploadedEntries = Object.entries(evidenceBySlot);
    // 提交门槛与确认页一致：必填槽位全部满足即可提交；
    // 任务没有文件要求时允许纯字段确认提交（evidenceIds 可为空），不再硬性要求至少一份上传。
    const missingRequired = missingTaskEvidenceSlotLabels(
      evidencePlan.slots,
      fieldValues,
      uploadedEntries.map(([key]) => key)
    );
    if (missingRequired.length > 0) {
      setSubmitMachine({ status: "failed", message: `请先补全必填项：${missingRequired.join("、")}` });
      return;
    }
    // 上传后相关字段已变更：现有指纹不再代表当前表单内容，禁止提交。
    const staleLabels = Object.keys(evidenceBySlot)
      .filter((key) => isEvidenceSlotStale(fieldSnapshotsBySlot[key], fieldValues))
      .map((key) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);
    if (staleLabels.length > 0) {
      setSubmitMachine({
        status: "failed",
        message: `字段已变更，请重新上传以更新指纹：${staleLabels.join("、")}`
      });
      return;
    }
    // 凭证核验异常（mismatch/missing_file）的隔离凭证不得作为有效业务凭证：
    // 提交门槛必须阻断，闭环"隔离凭证不可用"的前端契约。
    const verificationFailedLabels = Object.entries(proofsBySlot)
      .filter(([, proof]) => proof.verificationStatus === "mismatch" || proof.verificationStatus === "missing_file")
      .map(([key]) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);
    if (verificationFailedLabels.length > 0) {
      setSubmitMachine({
        status: "failed",
        message: `凭证核验异常（内容与指纹不符或文件缺失），请重新上传：${verificationFailedLabels.join("、")}`
      });
      return;
    }
    // 已上传但无核验记录的槽位按"未确认"禁锁：重新上传可恢复核验链路。
    const unverifiedLabels = Object.keys(evidenceBySlot)
      .filter((key) => !proofsBySlot[key])
      .map((key) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);
    if (unverifiedLabels.length > 0) {
      setSubmitMachine({
        status: "failed",
        message: `凭证核验状态未知（未取到核验记录），请重新上传：${unverifiedLabels.join("、")}`
      });
      return;
    }
    submitInflightRef.current = true;
    try {
      setSubmitMachine({ status: "preparing", message: "正在准备签名前摘要" });
      const account = await requestWalletAccount();
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      const preparedResult = await api.prepareTaskSubmit(activeTask.taskId, {
        evidenceIds: uploadedEntries.map(([, value]) => value.evidenceId),
        walletAddress: account.address,
        // intent 以任务 spec（addOnManifest 动作声明）驱动，不再按按钮硬编码。
        intent: taskSubmitIntent(activeTask)
      });
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      setSubmitMachine({
        status: "signature_pending",
        message: "等待钱包授权",
        prepared: preparedResult.data,
        source: preparedResult.source
      });
      // 与 executor-kit 同边界：签名前校验 typedData 的 primaryType、domain 和 submitter，
      // prepared 记录与 typedData 声明的提交方必须一致，防止换签名对象。
      // verifyingContract 预期来自部署配置注入（独立来源，不读同一 BFF 响应
      // 里的任务投影地址），缺配置即拒绝签名，不再条件性跳过比对。
      const signature = await signTypedData(account, preparedResult.data.typedData, {
        primaryType: "UVPStateMachineSignal",
        domainName: "UVPStateMachine",
        // 协议冻结面：domain.version 以 protocol-bindings 导出的常量为唯一来源。
        domainVersion: PRODUCT_SUBMIT_DOMAIN_VERSION,
        verifyingContract: stateMachineSignExpectation().verifyingContract,
        submitter: account.address,
        preparedSubmitters: [preparedResult.data.summary.walletAddress]
      });
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      const submissionResult = await api.submitTask(activeTask.taskId, {
        prepareId: preparedResult.data.prepareId,
        signature,
        walletAddress: account.address
      });
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      setSubmitMachine({
        status: "tx_pending",
        message: "提交处理中，等待确认",
        prepared: preparedResult.data,
        submission: submissionResult.data,
        source: submissionResult.source
      });
      await pollSubmission(submissionResult.data.submissionId, preparedResult.data, submissionResult.source, requestScopeKey);
    } catch (error) {
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      if (error instanceof WalletNotConnectedError) {
        setSubmitMachine({ status: "wallet_not_connected", message: "请连接浏览器钱包后再确认提交" });
        return;
      }
      if (error instanceof WalletRejectedError) {
        setSubmitMachine({ status: "wallet_rejected", message: "你取消了签名，可以重新提交" });
        return;
      }
      setSubmitMachine({ status: "failed", message: readableError(error, "确认提交失败") });
    } finally {
      submitInflightRef.current = false;
    }
  }

  async function pollSubmission(submissionId: string, prepared: PreparedSubmitDTO, source: ProductApiSource, requestScopeKey: string): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await delay(1100);
      let result: Awaited<ReturnType<typeof api.getSubmission>>;
      try {
        result = await api.getSubmission(submissionId);
      } catch {
        // 瞬时网络/超时错误不判失败：交易可能已确认，继续轮询；
        // 窗口耗尽仍未知时按"结果未知"中间态收尾，绝不诱导重投。
        if (taskScopeRef.current !== requestScopeKey) {
          return;
        }
        setSubmitMachine({
          status: "tx_pending",
          message: "查询提交状态暂时失败，仍在等待确认；请勿重复提交",
          prepared,
          source
        });
        continue;
      }
      if (taskScopeRef.current !== requestScopeKey) {
        return;
      }
      const outcome = submissionPollOutcome(result.data.status);
      if (outcome === "confirmed") {
        setSubmitMachine({
          status: "confirmed",
          message: "提交已确认，订单页稍后会同步最新状态",
          prepared,
          submission: result.data,
          source: result.source
        });
        onMutationSuccess?.();
        return;
      }
      if (outcome === "terminal_failure") {
        // failed/expired/replaced 是服务端记录的明确终态，才允许宣判失败；
        // replaced 指向"已被后续提交取代"，文案不得诱导盲目重投。
        setSubmitMachine({
          status: "failed",
          message: submissionTerminalMessage(result.data.status, result.data.errorCode),
          prepared,
          submission: result.data,
          source: result.source
        });
        return;
      }
      setSubmitMachine({
        status: "tx_pending",
        message: "提交处理中，等待确认",
        prepared,
        submission: result.data,
        source: result.source
      });
    }
    if (taskScopeRef.current !== requestScopeKey) {
      return;
    }
    // 轮询窗口耗尽 ≠ 失败：交易可能仍在索引，保持"结果未知"中间态，不诱导重投。
    setSubmitMachine({
      status: "tx_pending",
      message: `仍在索引中，暂未收到最终确认；可稍后刷新查看结果，请勿重复提交（提交编号 ${submissionId}）`,
      prepared,
      source
    });
  }

  return {
    evidencePlan,
    evidenceBySlot,
    evidenceProofsBySlot: proofsBySlot,
    staleSlotLabels,
    unverifiedSlotLabels,
    evidenceAction,
    uploadingSlotKeys,
    submitMachine,
    handleUploadEvidence,
    handleConfirmSubmit
  };
}
