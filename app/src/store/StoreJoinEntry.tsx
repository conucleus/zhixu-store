import { Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type { StoreAccessState, StoreJoinApplicationSubmitInput } from "./types";

/**
 * 详情页加入入口：选 role slot + 授权类型 → 提交申请。
 * 只有会话已锚定地址才可提交（红线由服务端强制，前端只做提示）。
 */
export function StoreJoinEntry({
  access,
  api,
  planId,
  roleSlots,
  stageIds,
  onSubmitted,
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly planId: string;
  readonly roleSlots: readonly { readonly slotId: string; readonly title: string }[];
  readonly stageIds: readonly string[];
  readonly onSubmitted: () => void;
}) {
  const [slotId, setSlotId] = useState(roleSlots[0]?.slotId ?? "");
  const [kind, setKind] = useState<StoreJoinApplicationSubmitInput["authorizationKind"]>("signal_submitter");
  const [stageId, setStageId] = useState(stageIds[0] ?? "");
  const [displayName, setDisplayName] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!access.anchoredAddress) {
    return (
      <section className="side-panel store-join-entry" data-testid="store-join-entry">
        <div className="side-panel-title">
          <h3><UserPlus /> 加入这条秩序</h3>
        </div>
        <p className="store-account-warn">
          <ShieldAlert /> 提交加入申请要求会话已锚定钱包地址。请先在「账号与地址」页连接钱包登录。
        </p>
      </section>
    );
  }

  async function handleSubmit(): Promise<void> {
    if (busy || !slotId) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.submitJoinApplication({
        planId,
        roleSlotId: slotId,
        authorizationKind: kind,
        ...(kind === "stage_executor" && stageId ? { stageId } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(statement.trim() ? { statement: statement.trim() } : {}),
      });
      setMessage("申请已提交：等待该秩序的发布者（或受托成员）审核。");
      onSubmitted();
    } catch (submitError) {
      setError(readableStoreError(submitError, "提交失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="side-panel store-join-entry" data-testid="store-join-entry">
      <div className="side-panel-title">
        <h3><UserPlus /> 加入这条秩序</h3>
      </div>
      <label className="store-join-field">
        角色槽位
        <select value={slotId} onChange={(event) => setSlotId(event.target.value)} data-testid="store-join-slot-select">
          {roleSlots.map((slot) => (
            <option key={slot.slotId} value={slot.slotId}>{slot.title}（{slot.slotId}）</option>
          ))}
        </select>
      </label>
      <label className="store-join-field">
        授权类型
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value === "stage_executor" ? "stage_executor" : "signal_submitter")}
          data-testid="store-join-kind-select"
        >
          <option value="signal_submitter">signal 提交资格</option>
          <option value="stage_executor">stage 执行者</option>
        </select>
      </label>
      {kind === "stage_executor" ? (
        <label className="store-join-field">
          目标阶段
          <select value={stageId} onChange={(event) => setStageId(event.target.value)} data-testid="store-join-stage-select">
            {stageIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="store-join-field">
        展示名称（可选）
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="供应商名称" />
      </label>
      <label className="store-join-field">
        申请说明（可选）
        <textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={2} placeholder="能力/资质说明" />
      </label>
      <button className="primary-button block" onClick={() => void handleSubmit()} disabled={busy || !slotId} data-testid="store-join-submit">
        {busy ? <Loader2 className="spin" /> : null} 提交加入申请
      </button>
      {message ? <p className="store-account-message" data-testid="store-join-entry-message">{message}</p> : null}
      {error ? <p className="store-account-message is-error" data-testid="store-join-entry-error">{error}</p> : null}
    </section>
  );
}
