// 待办详情页：原 ProductWorkbenchApp.tsx 的 TaskPage（纯搬迁）。
// 提交门槛与证据计划由 workbench 的 useTaskSubmissionFlow/workbenchSupport 提供。
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileText, HelpCircle, Layers3, PackageCheck } from "lucide-react";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type { EvidenceObjectDTO, EvidenceProofDTO } from "../api";
import type { ActionState } from "../workbench/workbenchTypes";
import {
  FRAMEWORK_NOTES_FIELD_KEY,
  taskSubmitActionLabel,
  type TaskEvidenceFieldValues,
  type TaskEvidencePlan
} from "../workbench/workbenchSupport";
import { EvidenceUploadZone } from "../evidence/EvidenceUploadZone";
import {
  ActionNotice,
  BackLine,
  Field,
  InlineEmpty,
  Panel,
  SummaryItem,
  Textarea
} from "../workbench/WorkbenchWidgets";

export function TaskPage({
  task,
  evidencePlan,
  evidenceBySlot,
  evidenceProofsBySlot,
  uploadAction,
  uploadingSlotKeys,
  canConfirm,
  missingEvidenceLabels,
  staleSlotLabels,
  unverifiedEvidenceLabels,
  verificationFailedLabels,
  fieldValues,
  onFieldValuesChange,
  onBack,
  onUpload,
  onSubmit,
  onDispute
}: {
  task: ProductTaskDTO;
  evidencePlan: TaskEvidencePlan;
  evidenceBySlot: Readonly<Record<string, EvidenceObjectDTO>>;
  evidenceProofsBySlot: Readonly<Record<string, EvidenceProofDTO>>;
  uploadAction: ActionState;
  uploadingSlotKeys: readonly string[];
  canConfirm: boolean;
  missingEvidenceLabels: readonly string[];
  staleSlotLabels: readonly string[];
  unverifiedEvidenceLabels: readonly string[];
  verificationFailedLabels: readonly string[];
  fieldValues: TaskEvidenceFieldValues;
  onFieldValuesChange: (patch: TaskEvidenceFieldValues) => void;
  onBack: () => void;
  onUpload: (slotKey: string, file: File) => void;
  onSubmit: () => void;
  onDispute: () => void;
}) {
  const fileSlots = evidencePlan.slots.filter((slot) => slot.inputKind === "file");
  const inputSlots = evidencePlan.slots.filter((slot) => slot.inputKind !== "file");
  const declaredEvidenceLabels = evidencePlan.slots.map((slot) => slot.label);
  // 提交入口文案由服务端随任务下发（manifest/插件/任务级 primaryActionLabel），
  // 前端不按意图推导；拒绝/争议任务的差异由发布者配置声明。
  const submitActionLabel = taskSubmitActionLabel(task);

  return (
    <section className="page-shell" data-testid="task-detail-page">
      <BackLine onClick={onBack}>返回待办列表</BackLine>
      <h1>{task.title}</h1>
      <p className="page-subtitle">{task.subtitle}</p>
      {task.status === "blocked" && task.blockedReason ? (
        // 服务端已给出确定原因的 blocked 是终态（如链上条件已取消），
        // 如实呈现原因，不渲染成无限期的"同步中"。
        <div className="warning-box" data-testid="task-blocked-reason" role="alert">
          <AlertTriangle />
          <div>
            <strong>该待办已阻塞（终态）</strong>
            <p>{task.blockedReason}</p>
          </div>
        </div>
      ) : null}
      <div className="summary-strip task-summary">
        <SummaryItem icon={<FileText />} label="订单" title={task.orderTitle} />
        <SummaryItem icon={<Layers3 />} label="阶段" title={task.stageName} />
        <SummaryItem icon={<Clock3 />} label="截止时间" title={task.deadline} />
        <SummaryItem icon={<PackageCheck />} label="提交后影响" title={task.fundingImpact} />
      </div>
      <div className="content-layout">
        <Panel>
          <h2>上传阶段凭证</h2>
          <p>本待办需要的凭证：{declaredEvidenceLabels.length > 0 ? declaredEvidenceLabels.join("、") : "按业务约定提交凭证"}。请按以下槽位上传文件并填写信息。</p>
          {fileSlots.length > 0 ? fileSlots.map((slot) => (
            <EvidenceUploadZone key={slot.key} slot={slot} uploaded={evidenceBySlot[slot.key]} proof={evidenceProofsBySlot[slot.key]} uploading={uploadingSlotKeys.includes(slot.key)} onFileSelected={(file) => onUpload(slot.key, file)} />
          )) : <InlineEmpty text="本待办无需上传文件凭证" />}
          {staleSlotLabels.length > 0 ? (
            <div className="warning-box" data-testid="task-evidence-stale-warning">
              <AlertTriangle />
              <div>
                <strong>字段已变更，请重新上传以更新指纹</strong>
                <p>以下凭证上传后相关字段又发生了变化：{staleSlotLabels.join("、")}。重新上传对应凭证之前无法提交。</p>
              </div>
            </div>
          ) : null}
          {unverifiedEvidenceLabels.length > 0 ? (
            <div className="warning-box" data-testid="task-evidence-unverified-warning" role="alert">
              <AlertTriangle />
              <div>
                <strong>凭证核验状态未知，暂不能提交</strong>
                <p>以下凭证已上传但未取到核验记录：{unverifiedEvidenceLabels.join("、")}。请重新上传对应凭证后再提交。</p>
              </div>
            </div>
          ) : null}
          {verificationFailedLabels.length > 0 ? (
            <div className="warning-box" data-testid="task-evidence-verification-warning" role="alert">
              <AlertTriangle />
              <div>
                <strong>凭证核验异常，不能作为有效凭证提交</strong>
                <p>以下凭证的核验结果为不一致或文件缺失：{verificationFailedLabels.join("、")}。请重新上传对应凭证后再提交。</p>
              </div>
            </div>
          ) : null}
          <ActionNotice state={uploadAction} />
          <div className="two-col">
            {inputSlots.map((slot) => slot.inputKind === "date" ? (
              <Field key={slot.key} label={slot.label} required={slot.required} type="date" value={fieldValues[slot.key] ?? ""} onChange={(value) => onFieldValuesChange({ [slot.key]: value })} icon={<CalendarDays />} testId={`task-field-${slot.key}`} />
            ) : (
              <Field key={slot.key} label={slot.label} required={slot.required} value={fieldValues[slot.key] ?? ""} onChange={(value) => onFieldValuesChange({ [slot.key]: value })} placeholder={`请输入${slot.label}`} testId={`task-field-${slot.key}`} />
            ))}
          </div>
          <Textarea label="备注（选填）" value={fieldValues[FRAMEWORK_NOTES_FIELD_KEY] ?? ""} onChange={(notes) => onFieldValuesChange({ [FRAMEWORK_NOTES_FIELD_KEY]: notes })} placeholder="请输入备注信息（如有特殊说明可在此填写）" />        </Panel>
        <aside className="side-card">
          <h2>责任确认</h2>
          {task.responsibilityStatements.map((statement) => (
            <CheckStatement key={statement.title} title={statement.title} desc={statement.desc} />
          ))}
          <button className={canConfirm ? "primary-button block" : "disabled-button block"} data-testid="task-confirm-button" onClick={canConfirm ? onSubmit : undefined} disabled={!canConfirm}>{submitActionLabel}</button>
          {!canConfirm && missingEvidenceLabels.length > 0 ? (
            <p className="side-note" data-testid="task-confirm-blocked-note"><HelpCircle /> 还需完成：{missingEvidenceLabels.join("、")}</p>
          ) : null}
          {!canConfirm && verificationFailedLabels.length > 0 ? (
            <p className="side-note" data-testid="task-confirm-verification-blocked-note"><HelpCircle /> 凭证核验异常：{verificationFailedLabels.join("、")}</p>
          ) : null}
          <div className="split-actions">
            <button className="secondary-button" onClick={onDispute}>无法完成</button>
            <button className="secondary-button" onClick={onDispute}>提出争议</button>
          </div>
          <p className="side-note"><HelpCircle /> 如需帮助，请查看帮助中心。</p>
        </aside>
      </div>
    </section>
  );
}


function CheckStatement({ title, desc }: { title: string; desc: string }) {
  return <div className="check-statement"><CheckCircle2 /><div><strong>{title}</strong><p>{desc}</p></div></div>;
}
