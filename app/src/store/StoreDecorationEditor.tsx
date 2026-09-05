import { History, Loader2, Paintbrush, UserCog } from "lucide-react";
import { useState } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type {
  StoreAccessState,
  StoreDecorationDataView,
  StoreDecorationView
} from "./types";

/**
 * 装修编辑器（详情页侧栏抽屉）：
 * - 只有 planPublisher（或受托成员）能保存——服务端强制，前端只读权限视图做展示。
 * - theme 为纯展示字段；taskDeclarations.evidenceSpec 走结构校验（服务端
 *   validateTaskEvidenceSpec 同源规则），永不编码业务预期。
 * - 版本 append-only：每次保存产生新版本，可回滚到历史版本展示。
 * - 委托表：publisher 本人才可增删团队成员地址（只传 Store 侧操作权）。
 */
export function StoreDecorationEditor({
  access,
  api,
  planId,
  decoration,
  viewerIsPublisher,
  viewerIsDelegate,
  onChanged,
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly planId: string;
  readonly decoration: StoreDecorationView | undefined;
  readonly viewerIsPublisher: boolean;
  readonly viewerIsDelegate: boolean;
  readonly onChanged: () => void;
}) {
  // publisher 与受托成员都可写装修；委托只传 Store 侧操作权。
  const canWrite = (viewerIsPublisher || viewerIsDelegate) && Boolean(access.anchoredAddress);
  const current = decoration?.current;
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(current?.data.theme?.displayName ?? "");
  const [description, setDescription] = useState(current?.data.theme?.description ?? "");
  const [tags, setTags] = useState((current?.data.theme?.tags ?? []).join(", "));
  const [specText, setSpecText] = useState("");
  const [delegationAddress, setDelegationAddress] = useState("");
  const [delegations, setDelegations] = useState<Awaited<ReturnType<typeof api.listDelegations>>["data"] | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  function seedFrom(version: StoreDecorationView["current"]): void {
    setDisplayName(version?.data.theme?.displayName ?? "");
    setDescription(version?.data.theme?.description ?? "");
    setTags((version?.data.theme?.tags ?? []).join(", "));
    setSpecText(JSON.stringify(version?.data.taskDeclarations ?? [], null, 2));
  }

  async function loadDelegations(publisherAddress: string): Promise<void> {
    try {
      const result = await api.listDelegations(publisherAddress);
      setDelegations(result.data);
    } catch (loadError) {
      setError(readableStoreError(loadError, "委托表加载失败"));
    }
  }

  async function handleSave(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    let taskDeclarations: unknown;
    if (specText.trim().length > 0) {
      try {
        taskDeclarations = JSON.parse(specText);
      } catch {
        setError("任务级声明不是合法 JSON（taskDeclarations）");
        setBusy(false);
        return;
      }
    }
    const data: StoreDecorationDataView = {
      schemaVersion: "store-zhixu-decoration.v1",
      theme: {
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(tags.trim() ? { tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter((tag) => tag.length > 0) } : {}),
      },
      ...(taskDeclarations !== undefined ? { taskDeclarations: taskDeclarations as StoreDecorationDataView["taskDeclarations"] } : {}),
    };
    try {
      await api.saveDecoration(planId, data);
      setMessage("已保存为新版本（append-only，可在历史中回看）");
      onChanged();
    } catch (saveError) {
      setError(readableStoreError(saveError, "保存失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(version: number): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.restoreDecorationVersion(planId, version);
      setMessage(`已回滚到版本 ${version}（以新版本落盘）`);
      onChanged();
    } catch (restoreError) {
      setError(readableStoreError(restoreError, "回滚失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant(): Promise<void> {
    if (busy || !access.anchoredAddress) {
      return;
    }
    const member = delegationAddress.trim();
    if (!member.startsWith("0x") || member.length !== 42) {
      setError("成员地址格式不正确（0x…42 位）");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.grantDelegation(access.anchoredAddress, member);
      setDelegations(result.data);
      setDelegationAddress("");
      setMessage(`已委托 ${member}（仅 Store 侧操作权，不含链上签名权）`);
    } catch (grantError) {
      setError(readableStoreError(grantError, "委托失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(delegationId: string): Promise<void> {
    if (busy || !access.anchoredAddress) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.revokeDelegation(delegationId);
      setDelegations(result.data);
      setMessage("已撤销委托，该成员立即失去装修写权限");
    } catch (revokeError) {
      setError(readableStoreError(revokeError, "撤销失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="side-panel store-decoration-panel" data-testid="store-decoration-panel">
      <div className="side-panel-title">
        <h3><Paintbrush /> 装修（凝结核数据）</h3>
        {canWrite ? (
          <button className="secondary-button" onClick={() => {
            setOpen((value) => !value);
            if (!open) {
              seedFrom(decoration?.current);
              if (access.anchoredAddress) {
                void loadDelegations(access.anchoredAddress);
              }
            }
          }} data-testid="store-decoration-toggle">
            {open ? "收起编辑器" : "编辑装修数据"}
          </button>
        ) : null}
      </div>

      {current ? (
        <div className="store-decoration-summary">
          <p><strong>{current.data.theme?.displayName ?? "（未设置展示名）"}</strong></p>
          {current.data.theme?.description ? <p className="muted">{current.data.theme.description}</p> : null}
          {current.data.theme?.tags && current.data.theme.tags.length > 0 ? (
            <p className="muted">标签：{current.data.theme.tags.join("、")}</p>
          ) : null}
          <p className="muted">版本 v{current.version} · {(current.data.taskDeclarations ?? []).length} 条任务级声明</p>
        </div>
      ) : (
        <p className="muted">尚无装修数据。展示名、描述与任务级声明（evidenceSpec）由发布者以纯数据提供，Store 通用渲染。</p>
      )}

      {open && canWrite ? (
        <div className="store-decoration-editor" data-testid="store-decoration-editor">
          <label className="store-join-field">
            展示名
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} data-testid="store-decoration-display-name" />
          </label>
          <label className="store-join-field">
            描述
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
          </label>
          <label className="store-join-field">
            标签（逗号分隔）
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          <label className="store-join-field">
            任务级声明 JSON（taskDeclarations，结构校验）
            <textarea
              value={specText}
              onChange={(event) => setSpecText(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder='[{"stageId":"...","evidenceSpec":[{"key":"invoice","label":"发票","inputKind":"file","required":true}]}]'
              data-testid="store-decoration-spec"
            />
          </label>
          <button className="primary-button block" onClick={() => void handleSave()} disabled={busy} data-testid="store-decoration-save">
            {busy ? <Loader2 className="spin" /> : null} 保存为新版本
          </button>

          <div className="store-decoration-history">
            <h4><History /> 版本历史</h4>
            {[...decoration?.versions ?? []].reverse().slice(0, 8).map((version) => (
              <div className="store-decoration-version-row" key={version.version}>
                <span>v{version.version} · {new Date(version.createdAt).toLocaleString()}</span>
                <button className="secondary-button" onClick={() => void handleRestore(version.version)} disabled={busy}>
                  回滚展示
                </button>
              </div>
            ))}
          </div>

          <div className="store-decoration-delegation" data-testid="store-decoration-delegation">
            <h4><UserCog /> 团队委托（publisher 本人管理）</h4>
            <p className="muted">委托只传递 Store 侧操作权（装修/加入审核），不传递链上签名权；撤销立即生效。</p>
            <div className="store-decoration-delegation-form">
              <input
                value={delegationAddress}
                onChange={(event) => setDelegationAddress(event.target.value)}
                placeholder="成员地址 0x…"
                data-testid="store-delegation-member-input"
              />
              <button className="secondary-button" onClick={() => void handleGrant()} disabled={busy}>授予</button>
            </div>
            {delegations ? (
              <ul className="store-delegation-list">
                {delegations.delegations.map((entry) => (
                  <li key={entry.delegationId} className={entry.revokedAt ? "is-revoked" : ""}>
                    <span className="mono">{entry.memberAddress}</span>
                    <span className="muted">{entry.revokedAt ? "已撤销" : "生效中"}</span>
                    {!entry.revokedAt ? (
                      <button className="secondary-button" onClick={() => void handleRevoke(entry.delegationId)} disabled={busy}>撤销</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {!canWrite ? (
        <p className="muted">装修写权限属于 planPublisher（或其受托成员）；当前会话{access.anchoredAddress ? "不是该秩序的发布者或受托成员" : "未锚定地址"}。</p>
      ) : null}
      {message ? <p className="store-account-message">{message}</p> : null}
      {error ? <p className="store-account-message is-error" data-testid="store-decoration-error">{error}</p> : null}
    </section>
  );
}
