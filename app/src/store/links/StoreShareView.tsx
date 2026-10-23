import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { readableStoreError, type StoreApiClient } from "../api";
import type { StoreDecorationTaskDeclarationView, StoreZhixuOverlayView } from "../types";
import type { StoreZhixuDetailDTO } from "@uvp-eth/product-dto";

type ShareState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }
  | { readonly status: "error"; readonly message: string };

/**
 * 分享链接的只读读者页：展示凝结核提供的装修主题、阶段要求与角色/证据清单。
 * 只读、无操作、无目录检索；不出现链上术语，也不构成对任何主体的背书。
 */
export function StoreShareView({ api, zhixuId }: { readonly api: StoreApiClient; readonly zhixuId: string }) {
  const [state, setState] = useState<ShareState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void api.getZhixuDetailWithOverlay(zhixuId).then((result) => {
      if (!cancelled) {
        setState({ status: "ready", zhixu: result.data.zhixu, ...(result.data.overlay ? { overlay: result.data.overlay } : {}) });
      }
    }).catch((error) => {
      if (!cancelled) {
        setState({ status: "error", message: readableStoreError(error, "装修页加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, zhixuId]);

  if (state.status === "loading") {
    return (
      <section className="page-shell" data-testid="store-share-view">
        <p className="muted"><Loader2 className="spin" /> 正在加载装修页…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="page-shell" data-testid="store-share-view">
        <div className="state-panel error" role="alert">
          <span><AlertTriangle /></span>
          <div>
            <h2>装修页不可用</h2>
            <p>{state.message}</p>
          </div>
        </div>
      </section>
    );
  }

  const zhixu = state.zhixu;
  const theme = state.overlay?.decoration?.current?.data.theme;
  const declarations = state.overlay?.decoration?.current?.data.taskDeclarations ?? [];
  return (
    <section className="page-shell" data-testid="store-share-view" data-zhixu-id={zhixuId}>
      <header className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="store-section-kicker">邀请方提供的交易说明</span>
            <h1>{theme?.displayName ?? zhixu.title}</h1>
            <p>{theme?.description ?? zhixu.subtitle}</p>
          </div>
        </div>
        {theme?.tags && theme.tags.length > 0 ? (
          <p className="muted">标签：{theme.tags.join("、")}</p>
        ) : null}
        {theme?.highlights && theme.highlights.length > 0 ? (
          <ul className="store-check-list">
            {theme.highlights.map((highlight) => (
              <li key={highlight}><ShieldCheck /> {highlight}</li>
            ))}
          </ul>
        ) : null}
        <p className="muted">维护方：{zhixu.maintainer}</p>
      </header>

      <section className="panel-card" aria-labelledby="store-share-stages-title">
        <div className="panel-heading compact">
          <div>
            <span className="store-section-kicker">阶段</span>
            <h2 id="store-share-stages-title">这段协作按阶段推进</h2>
            <p>每个阶段等什么材料、由谁负责；具体安排以邀请方与当事人的约定为准。</p>
          </div>
        </div>
        <div className="store-lifecycle-list">
          {zhixu.stages.map((stage, index) => {
            const slots = evidenceSlotsForStage(declarations, stage.stageId);
            return (
              <div className="store-lifecycle-step" key={stage.stageId}>
                <span className="stage-index">{index + 1}</span>
                <div>
                  <strong>{stage.title}</strong>
                  {stage.description ? <span>{stage.description}</span> : null}
                  {stage.triggerSummary ? <span>开始条件：{stage.triggerSummary}</span> : null}
                  {stage.outputSummary ? <span>完成结果：{stage.outputSummary}</span> : null}
                  {slots.length > 0 ? (
                    <span>需要的材料：{slots.map((slot) => `${slot.label}${slot.required === false ? "（可选）" : ""}`).join("、")}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel-card" aria-labelledby="store-share-roles-title">
        <div className="panel-heading compact">
          <div>
            <span className="store-section-kicker">角色</span>
            <h2 id="store-share-roles-title">参与方与职责</h2>
            <p>角色由当事人按约定承担；邀请方不替任何人做判断或背书。</p>
          </div>
        </div>
        <div className="store-slot-grid">
          {zhixu.roleSlots.map((slot) => (
            <article className="store-slot-card" key={slot.roleSlotId}>
              <div className="store-slot-card-head">
                <div>
                  <span className="store-slot-id">{slot.required ? "必需角色" : "可选角色"}</span>
                  <h3>{slot.performanceSlotLabel || slot.title}</h3>
                  <p>{slot.title} · {slot.statusLabel}</p>
                </div>
              </div>
              <p className="store-slot-duty">{slot.description}</p>
              {slot.businessPersonaLabels.length > 0 ? (
                <p className="muted">适合：{slot.businessPersonaLabels.join("、")}</p>
              ) : null}
              {slot.expectedEvidence.length > 0 ? (
                <p className="muted">职责凭证：{slot.expectedEvidence.join("、")}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <p className="store-anchor-note">
        <ShieldCheck /> 本页由邀请方（凝结核）维护，只展示装修与规则信息；不构成对任何秩序或主体的背书。
      </p>
    </section>
  );
}

function evidenceSlotsForStage(
  declarations: readonly StoreDecorationTaskDeclarationView[],
  stageId: string
): readonly { readonly label: string; readonly required: boolean | undefined }[] {
  const slots: { label: string; required: boolean | undefined }[] = [];
  const seen = new Set<string>();
  for (const declaration of declarations) {
    if ((declaration.stageId ?? "").trim().toLowerCase() !== stageId.trim().toLowerCase()) {
      continue;
    }
    for (const slot of declaration.evidenceSpec ?? []) {
      const label = slot.label?.trim();
      const key = slot.key?.trim();
      if (!label || !key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      slots.push({ label, required: slot.required });
    }
  }
  return slots;
}
