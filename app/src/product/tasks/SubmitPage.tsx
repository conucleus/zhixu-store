// 提交确认页（所见即所签）：原 ProductWorkbenchApp.tsx 的 SubmitPage（纯搬迁）。
// 签名/提交状态机由 workbench 的 useTaskSubmissionFlow 提供。
import { AlertTriangle, Check, CheckCircle2, Circle, Clock3, Loader2, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type { EvidenceObjectDTO } from "../api";
import type { SubmitMachineState, SubmitMachineStatus } from "../workbench/workbenchTypes";
import { taskSubmitActionLabel, type TaskEvidencePlan, type TaskEvidenceSlot } from "../workbench/workbenchSupport";
import { shortHash } from "../../shared/frontend";
import { BackLine, MoneyRow, Panel, StatusBadge } from "../workbench/WorkbenchWidgets";

export function SubmitPage({
  task,
  evidencePlan,
  evidenceBySlot,
  submitMachine,
  canSubmit,
  staleSlotLabels,
  unverifiedEvidenceLabels,
  verificationFailedLabels,
  onBack,
  onSubmit,
  onOrder
}: {
  task: ProductTaskDTO;
  evidencePlan: TaskEvidencePlan;
  evidenceBySlot: Readonly<Record<string, EvidenceObjectDTO>>;
  submitMachine: SubmitMachineState;
  canSubmit: boolean;
  staleSlotLabels: readonly string[];
  unverifiedEvidenceLabels: readonly string[];
  verificationFailedLabels: readonly string[];
  onBack: () => void;
  onSubmit: () => void;
  onOrder: () => void;
}) {
  const [proofOpen, setProofOpen] = useState(false);
  const pending = submitMachine.status === "preparing" ||
    submitMachine.status === "signature_pending" ||
    submitMachine.status === "tx_pending";
  const confirmed = submitMachine.status === "confirmed";
  const failed = submitMachine.status === "failed" ||
    submitMachine.status === "wallet_not_connected" ||
    submitMachine.status === "wallet_rejected";
  const proofRows = submitMachine.submission?.proofRows ?? task.proofRows;
  const declaredEvidenceLabels = evidencePlan.slots.map((slot) => slot.label);
  // 主文案由服务端随任务下发（与入口按钮同源），前端不按意图推导；
  // 页面骨架（"/ 提交结果"后缀、确认按钮等）是框架结构，不含业务语义。
  const submitActionLabel = taskSubmitActionLabel(task);
  // 所见即所签：确认页列出全部已上传证据（签名覆盖的 evidenceIds 与之一一对应），
  // 每条带槽位名与指纹；纯字段任务没有文件凭证时如实说明。
  const uploadedEvidence = evidencePlan.slots
    .map((slot) => ({ slot, evidence: evidenceBySlot[slot.key] }))
    .filter((entry): entry is { slot: TaskEvidenceSlot; evidence: EvidenceObjectDTO } => Boolean(entry.evidence));
  return (
    <section className="page-shell" data-testid="submit-page">
      <BackLine onClick={onBack}>返回待办详情</BackLine>
      <h1>{`${submitActionLabel} / 提交结果`}</h1>
      <p className="page-subtitle">请确认凭证指纹和责任声明，钱包授权后会进入提交中状态。</p>
      <div className="submit-layout">
        <Panel>
          <StatusBadge tone="info">确认提交</StatusBadge>
          <h2>{submitActionLabel}</h2>
          <p>请确认你将代表 {task.assigneeRole} 提交「{submitActionLabel}」。</p>
          <ul className="confirm-list">
            <li><strong>订单：</strong>{task.orderTitle}</li>
            <li><strong>阶段：</strong>{task.stageName}</li>
            <li><strong>提交凭证：</strong>{declaredEvidenceLabels.length > 0 ? declaredEvidenceLabels.join("、") : "按业务约定提交凭证"}</li>
            <li>
              <strong>凭证指纹：</strong>
              {uploadedEvidence.length > 0 ? (
                <span className="confirm-fingerprint-list" data-testid="submit-fingerprint-list">
                  {uploadedEvidence.map(({ slot, evidence }) => (
                    <span className="confirm-fingerprint-item" key={evidence.evidenceId}>
                      {slot.label}：<code>{shortHash(evidence.payloadHash)}</code>
                    </span>
                  ))}
                </span>
              ) : (
                <span>无文件凭证（本次提交为纯字段确认）</span>
              )}
            </li>
            <li><strong>影响：</strong>{task.fundingImpact}</li>
            <li><strong>责任提示：</strong><em>提交后不可删除，只能追加更正或进入争议</em></li>
          </ul>
          <h3>签名前摘要</h3>
          <div className="auth-options">
            <div className="auth-option is-selected">
              <span><WalletCards /></span>
              <div>
                <strong>{submitMachine.prepared?.summary.actionLabel ?? submitActionLabel}</strong>
                <p>{submitMachine.prepared ? `授权有效期至 ${formatDateTime(submitMachine.prepared.summary.authorizationValidUntil)}` : "点击确认后会生成可读摘要并请求钱包授权。"}</p>
              </div>
              <CheckCircle2 />
            </div>
          </div>
          {staleSlotLabels.length > 0 ? (
            <div className="warning-box" data-testid="submit-stale-warning">
              <AlertTriangle />
              <div>
                <strong>字段已变更，请重新上传以更新指纹</strong>
                <p>以下凭证上传后相关字段又发生了变化：{staleSlotLabels.join("、")}。返回待办页重新上传对应凭证后再提交。</p>
              </div>
            </div>
          ) : null}
          {unverifiedEvidenceLabels.length > 0 ? (
            <div className="warning-box" data-testid="submit-unverified-warning" role="alert">
              <AlertTriangle />
              <div>
                <strong>凭证核验状态未知，禁止提交</strong>
                <p>以下凭证已上传但未取到核验记录：{unverifiedEvidenceLabels.join("、")}。返回待办页重新上传对应凭证后再提交。</p>
              </div>
            </div>
          ) : null}
          {verificationFailedLabels.length > 0 ? (
            <div className="warning-box" data-testid="submit-verification-warning" role="alert">
              <AlertTriangle />
              <div>
                <strong>凭证核验异常，禁止提交</strong>
                <p>以下凭证核验为不一致或文件缺失：{verificationFailedLabels.join("、")}。返回待办页重新上传对应凭证后再提交。</p>
              </div>
            </div>
          ) : null}
          <button className="primary-button block" data-testid="submit-confirm-button" onClick={onSubmit} disabled={!canSubmit || pending || confirmed}>
            {pending ? <Loader2 className="spin" /> : <WalletCards />} 确认并提交
          </button>
        </Panel>
        <Panel tone={confirmed ? "success" : "muted"}>
          <StatusBadge tone={confirmed ? "success" : failed ? "warning" : "info"}>{submitStatusLabel(submitMachine.status)}</StatusBadge>
          <div className="success-hero">
            <span className={failed ? "danger" : ""}>{confirmed ? <Check /> : pending ? <Loader2 className="spin" /> : failed ? <AlertTriangle /> : <Clock3 />}</span>
            <h2>{confirmed ? `已提交：${submitActionLabel}` : submitStatusTitle(submitMachine.status)}</h2>
            <p>{submitMachine.message}</p>
          </div>
          <ul className="success-list">
            <li><CheckCircle2 /> 凭证指纹{uploadedEvidence.length > 0 ? `已生成（${uploadedEvidence.length} 份）` : "待生成"}</li>
            <li>{submitMachine.prepared ? <CheckCircle2 /> : <Circle />} 签名前摘要{submitMachine.prepared ? "已生成" : "待生成"}</li>
            <li>{submitMachine.submission ? <CheckCircle2 /> : <Circle />} 提交记录{submitMachine.submission ? submitMachine.submission.statusLabel : "待创建"}</li>
            <li>{confirmed ? <CheckCircle2 /> : <Clock3 />} 下一步：等待订单页同步</li>
          </ul>
          <div className="button-row centered">
            <button className="secondary-button" onClick={onOrder}>返回订单</button>
            <button className="primary-button" data-testid="advanced-proof-button" onClick={() => setProofOpen(!proofOpen)}>查看高级证明</button>
          </div>
          {proofOpen ? (
            <div className="proof-box" data-testid="advanced-proof-box">
              <div className="proof-box-title"><ShieldCheck /> 高级链上证明</div>
              {proofRows.map((row) => <MoneyRow key={row.label} label={row.label} value={row.value} />)}
              {submitMachine.submission?.txHash ? <MoneyRow label="交易编号" value={submitMachine.submission.txHash} /> : null}
              {uploadedEvidence.map(({ slot, evidence }) => (
                <MoneyRow key={evidence.evidenceId} label={`凭证指纹 · ${slot.label}`} value={evidence.payloadHash} />
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </section>
  );
}


function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function submitStatusLabel(status: SubmitMachineStatus): string {
  switch (status) {
    case "idle":
      return "等待提交";
    case "preparing":
      return "准备中";
    case "wallet_not_connected":
      return "未连接钱包";
    case "wallet_rejected":
      return "钱包已取消";
    case "signature_pending":
      return "等待钱包授权";
    case "tx_pending":
      return "提交处理中";
    case "confirmed":
      return "已确认";
    case "failed":
      return "提交失败";
  }
}

function submitStatusTitle(status: SubmitMachineStatus): string {
  switch (status) {
    case "idle":
      return "等待提交";
    case "preparing":
      return "正在准备提交";
    case "wallet_not_connected":
      return "请连接钱包";
    case "wallet_rejected":
      return "你已取消授权";
    case "signature_pending":
      return "等待钱包授权";
    case "tx_pending":
      return "提交处理中";
    case "confirmed":
      // 中性状态文案：不含"阶段完成"意图语义（提交内容可能是拒绝/争议，
      // 业务语义由服务端下发的 submitActionLabel 承载）。
      return "提交已确认";
    case "failed":
      return "提交失败";
  }
}
