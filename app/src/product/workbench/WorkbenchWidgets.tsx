// 工作台通用展示件：原 ProductWorkbenchApp.tsx 底部的页面级通用组件（纯搬迁，逻辑一字未改）。
// 供 product/workbench 与 order/tasks/evidence/signing 各页面共用。
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Circle, FileText, Loader2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { ChainProofRowDTO, ProductTone } from "@uvp-eth/product-dto";
import type { ActionState } from "./workbenchTypes";

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <section className="page-shell">
      <StatePanel icon={<FileText />} title={title} desc={desc} />
    </section>
  );
}

export function InlineEmpty({ text }: { text: string }) {
  return <div className="inline-empty">{text}</div>;
}

export function StatePanel({
  icon,
  title,
  desc,
  tone = "muted"
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  tone?: "muted" | "info" | "error" | undefined;
}) {
  return (
    <section className={`state-panel ${tone}`}>
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </section>
  );
}

export function ActionNotice({ state, compact }: { state: ActionState; compact?: boolean }) {
  if (state.phase === "idle") {
    return null;
  }
  const icon = state.phase === "pending"
    ? <Loader2 className="spin" />
    : state.phase === "success"
      ? <CheckCircle2 />
      : <AlertTriangle />;
  return (
    <div className={`action-notice ${state.phase} ${compact ? "compact" : ""}`}>
      {icon}
      <span>{state.message}</span>
    </div>
  );
}

export function ProofPanel({
  open,
  onToggle,
  compactText,
  proofRows
}: {
  open: boolean;
  onToggle: () => void;
  compactText: string;
  proofRows: readonly ChainProofRowDTO[];
}) {
  return (
    <section className="proof-panel">
      <button className="proof-toggle" onClick={onToggle}>
        <span><ShieldCheck /> 高级链上证明</span>
        <small>{compactText}</small>
        <ChevronDown className={open ? "rotate" : ""} />
      </button>
      {open ? (
        <div className="proof-details">
          {proofRows.map((row) => <MoneyRow key={row.label} label={row.label} value={row.value} />)}
        </div>
      ) : null}
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  required,
  suffix,
  placeholder,
  type,
  icon,
  testId
}: {
  label: string;
  value?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  required?: boolean | undefined;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  type?: "text" | "date" | undefined;
  icon?: ReactNode | undefined;
  testId?: string | undefined;
}) {
  const controlled = Boolean(onChange);
  return (
    <label className="field">
      <span>{label}{required ? <em>*</em> : null}</span>
      <div className="input-wrap">
        <input
          type={type}
          {...(controlled ? { value: value ?? "", onChange: (event) => onChange?.(event.currentTarget.value) } : { defaultValue: value })}
          placeholder={placeholder}
          {...(testId ? { "data-testid": testId } : {})}
        />
        {suffix ? <b>{suffix}</b> : null}
        {icon ? <i>{icon}</i> : null}
      </div>
    </label>
  );
}

export function SelectField({ label, value, onChange, options, required }: {
  label: string;
  value: string;
  onChange?: ((value: string) => void) | undefined;
  options?: readonly string[] | undefined;
  required?: boolean | undefined;
}) {
  const choices = options && options.length > 0 ? options : [value];
  return (
    <label className="field">
      <span>{label}{required ? <em>*</em> : null}</span>
      <div className="input-wrap">
        <select
          value={value}
          disabled={!onChange}
          onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
        >
          {choices.map((option) => <option key={option} value={option}>{option || "请选择"}</option>)}
        </select>
        <i><ChevronDown /></i>
      </div>
    </label>
  );
}

export function Textarea({ label, value, onChange, placeholder, required }: {
  label: string;
  value?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
}) {
  const controlled = Boolean(onChange);
  return (
    <label className="field span-2">
      <span>{label}{required ? <em>*</em> : null}</span>
      <textarea
        {...(controlled ? { value: value ?? "", onChange: (event) => onChange?.(event.currentTarget.value) } : { defaultValue: value })}
        placeholder={placeholder}
      />
    </label>
  );
}

function ChoiceGroup({ label, options, active, onSelect }: { label: string; options: readonly string[]; active: string; onSelect?: ((value: string) => void) | undefined }) {
  return (
    <div className="field span-2">
      <span>{label}<em>*</em></span>
      <div className="choice-row">
        {options.map((option) => (
          <button
            className={`choice-button ${option === active ? "is-active" : ""}`}
            key={option}
            onClick={onSelect ? () => onSelect(option) : undefined}
          >
            <Circle /> {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Panel({ children, tone }: { children: ReactNode; tone?: "success" | "muted" | undefined }) {
  return <section className={`panel-card ${tone ? `panel-${tone}` : ""}`}>{children}</section>;
}

export function SidePanel({ title, children, action }: { title: string; children: ReactNode; action?: string | undefined }) {
  return (
    <section className="side-panel">
      <div className="side-panel-title">
        <h3>{title}</h3>
        {action ? <button>{action}</button> : null}
      </div>
      {children}
    </section>
  );
}

export function BackLine({ children, onClick }: { children: ReactNode; onClick?: (() => void) | undefined }) {
  return <button className="back-line" onClick={onClick}><ChevronLeft /> {children}</button>;
}

export function StatusBadge({ children, icon, tone = "default" }: { children: ReactNode; icon?: ReactNode | undefined; tone?: "success" | "warning" | "info" | "default" | undefined }) {
  return <span className={`status-badge ${tone}`}>{icon}{children}</span>;
}

export function NoticeCard({ icon, title, tone }: { icon: ReactNode; title: string; tone: "success" | "warning" }) {
  return <div className={`notice-card ${tone}`}>{icon}<strong>{title}</strong></div>;
}

export function SideMetric({ icon, label, value, tone }: { icon?: ReactNode | undefined; label: string; value: ReactNode; tone?: "success" | undefined }) {
  return (
    <div className="side-metric">
      {icon ? <span className={tone ?? ""}>{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SummaryItem({ icon, label, title, tone }: { icon: ReactNode; label?: string | undefined; title: string; tone?: "success" | undefined }) {
  return (
    <div className={`summary-item ${tone ?? ""}`}>
      {icon}
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{title}</strong>
      </div>
    </div>
  );
}

export function StatusText({ children, tone, testId }: { children: ReactNode; tone: ProductTone; testId?: string | undefined }) {
  return <span className={`status-text ${tone}`} {...(testId ? { "data-testid": testId } : {})}>{children}</span>;
}

export function MoneyRow({ label, value, success, danger }: { label: string; value: ReactNode; success?: boolean; danger?: boolean }) {
  return <div className={`money-row ${success ? "success" : ""} ${danger ? "danger" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
