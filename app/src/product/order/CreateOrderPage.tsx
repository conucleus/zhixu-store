// 创建订单页（订单信息草稿表单）：原 ProductWorkbenchApp.tsx 的 CreateOrderPage，纯搬迁。
// 流程与状态由 workbench 的 useOrderDraftFlow 提供，本页只做渲染与表单值回传。
import { AlertTriangle, Check, Loader2, ShieldCheck } from "lucide-react";
import type { ZhixuDetailDTO } from "@uvp-eth/product-dto";
import type { ReactNode } from "react";
import type { ProductOrderDraftDTO } from "../api";
import type { ActionState } from "../workbench/workbenchTypes";
import type { OrderDraftFormValues } from "../workbench/useOrderDraftFlow";
import { canCreateProductOrder } from "../workbench/workbenchSupport";
import { draftStatusLabel } from "./draftStatusLabel";
import {
  ActionNotice,
  BackLine,
  Field,
  NoticeCard,
  Panel,
  SelectField,
  SideMetric,
  StatePanel,
  StatusBadge,
  Textarea
} from "../workbench/WorkbenchWidgets";

export function CreateOrderPage({
  zhixu,
  draft,
  createAction,
  saveAction,
  values,
  onValuesChange,
  onBack,
  onCreate,
  onSave,
  onNext
}: {
  zhixu: ZhixuDetailDTO;
  draft?: ProductOrderDraftDTO | undefined;
  createAction: ActionState;
  saveAction: ActionState;
  values: OrderDraftFormValues;
  onValuesChange: (patch: Partial<OrderDraftFormValues>) => void;
  onBack: () => void;
  onCreate: (values: OrderDraftFormValues) => void;
  onSave: (values: OrderDraftFormValues) => void;
  onNext: () => void;
}) {
  const canCreate = canCreateProductOrder(zhixu);

  return (
    <section className="page-shell" data-testid="create-order-page">
      <BackLine onClick={onBack}>返回秩序详情</BackLine>
      <h1>创建订单</h1>
      {/* 步骤条只声明实际存在的页面（秩序详情→订单信息→参与方→订单启动）：
          此前的"订单条件/预览并发起"页并不存在，宣告 5 步只会误导参与者。 */}
      <StepBar current={2} steps={["确认秩序", "订单信息", "参与方", "订单启动"]} />
      {!canCreate ? <StatePanel icon={<AlertTriangle />} title="该秩序当前不可创建新订单" desc="请使用已审核且已发布的秩序。" tone="error" /> : null}
      <div className="content-layout">
        <Panel>
          <h2>订单信息</h2>
          <div className="form-grid">
            <Field label="订单名称" required value={values.title} onChange={(title) => onValuesChange({ title })} placeholder="请输入订单名称" />
            <Field label="业务类型" required value={values.businessType} onChange={(businessType) => onValuesChange({ businessType })} placeholder="按秩序配置填写" />
            <Textarea label="对象说明（可选）" value={values.goodsText} onChange={(goodsText) => onValuesChange({ goodsText })} placeholder="填写秩序要求的对象或交付说明，每行一项" />
            <Field label="总金额" required value={values.totalAmount} onChange={(totalAmount) => onValuesChange({ totalAmount })} placeholder="请输入总金额" />
            <SelectField label="币种" required value={values.currency} onChange={(currency) => onValuesChange({ currency })} options={[...new Set([values.currency.trim(), ...zhixu.supportedPaymentMethods].filter((item) => item.length > 0))]} />
            <Textarea label="备注" value={values.notes} onChange={(notes) => onValuesChange({ notes })} placeholder="请输入备注（如有特殊说明可在此填写）" />
          </div>
        </Panel>
        <aside className="side-card">
          <h2>订单摘要</h2>
          <SideMetric label="使用秩序" value={zhixu.title} />
          <SideMetric label="审核状态" value={<StatusBadge icon={<ShieldCheck />} tone={canCreate ? "success" : "warning"}>{zhixu.reviewLabel}</StatusBadge>} />
          <SideMetric label="阶段数" value={String(zhixu.stageCount)} />
          <SideMetric label="当前还需要" value="邀请所有关键参与方确认职责" />
          <SideMetric label="草稿状态" value={draft ? draftStatusLabel(draft.status) : "尚未创建"} />
          <NoticeCard icon={<ShieldCheck />} tone="success" title={`适用业务：${zhixu.applicableBusiness.join("、")}`} />
          <ActionNotice state={createAction} />
          <ActionNotice state={saveAction} />
        </aside>
      </div>
      <BottomActions>
        <button className="secondary-button" onClick={onBack}>上一步</button>
        <button className="secondary-button" data-testid="save-draft-button" onClick={() => onSave(values)} disabled={!canCreate || !draft || saveAction.phase === "pending"}>{saveAction.phase === "pending" ? <Loader2 className="spin" /> : null}保存草稿</button>
        <button className="secondary-button" data-testid="create-draft-button" onClick={() => onCreate(values)} disabled={!canCreate || createAction.phase === "pending"}>{createAction.phase === "pending" ? <Loader2 className="spin" /> : null}{draft ? "重新创建草稿" : "创建订单"}</button>
        <button className="primary-button" data-testid="next-participants-button" onClick={onNext} disabled={!canCreate || createAction.phase === "pending"}>下一步</button>
      </BottomActions>
    </section>
  );
}


function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="step-bar">
      {steps.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <div className={`step-item ${done ? "is-done" : ""} ${active ? "is-active" : ""}`} key={step}>
            <span>{done ? <Check /> : number}</span>
            <strong>{step}</strong>
          </div>
        );
      })}
    </div>
  );
}

function BottomActions({ children }: { children: ReactNode }) {
  return <footer className="bottom-actions">{children}</footer>;
}
