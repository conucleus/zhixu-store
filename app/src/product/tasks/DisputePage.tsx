// 争议页（通道未开通，如实呈现）：原 ProductWorkbenchApp.tsx 的 DisputePage（纯搬迁）。
import { AlertTriangle, HelpCircle, Loader2 } from "lucide-react";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type { ActionState } from "../workbench/workbenchTypes";
import {
  ActionNotice,
  BackLine,
  Field,
  InlineEmpty,
  Panel,
  SelectField,
  Textarea
} from "../workbench/WorkbenchWidgets";

export function DisputePage({
  task,
  action,
  onSave,
  onBack
}: {
  task: ProductTaskDTO;
  action: ActionState;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <section className="page-shell">
      <BackLine onClick={onBack}>返回订单</BackLine>
      <h1>对{task.stageName}凭证提出争议</h1>
      <p className="page-subtitle">当您认为“{task.stageName}”凭证存在问题时，可以先在这里记录争议说明。当前版本的争议提交通道尚未开通，提交不会产生任何记录，也不会通知对方或进入裁定流程。</p>
      <div className="dispute-grid">
        <Panel>
          <h2>争议信息</h2>
          <div className="form-grid">
            <Field label="争议对象" value={`${task.stageName}阶段`} />
            <SelectField label="争议原因" required value="请选择争议原因" />
            <Textarea label="说明" required placeholder="请说明争议原因，例如凭证不清晰、信息不一致、未按时完成等" />
            <p className="side-note">
              <HelpCircle /> 争议材料上传将随争议通道一起开通；当前表单不接收文件，也不显示任何上传承诺。
            </p>
          </div>
          <button className="primary-button align-right" onClick={onSave} disabled={action.phase === "pending"}>{action.phase === "pending" ? <Loader2 className="spin" /> : null}提交争议</button>
          <ActionNotice state={action} />
        </Panel>
        <Panel>
          <h2>相关事实</h2>
          <InlineEmpty text="暂无可核对的事实数据：争议提交未接入后端，未产生任何记录。" />
        </Panel>
      </div>
      <Panel>
        <h2>争议处理状态</h2>
        <div className="state-panel warning" data-testid="dispute-channel-status">
          <span><AlertTriangle /></span>
          <div>
            <h2>争议提交通道尚未开通</h2>
            <p>当前版本未接入后端争议处理：提交争议不会创建任何记录，也不存在对方回应或裁定的时间承诺。如需协商，请先通过订单房间与对方沟通，待通道开通后再正式提交。</p>
          </div>
        </div>
      </Panel>
    </section>
  );
}

