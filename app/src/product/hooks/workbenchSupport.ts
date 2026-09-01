export function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (error.message.includes("required_participants_missing")) {
    return "关键参与方尚未全部接受邀请";
  }
  if (error.message.includes("evidence_required")) {
    return "请先上传凭证";
  }
  if (error.message.includes("403")) {
    return "当前账号没有权限执行该操作";
  }
  return error.message && error.message !== "Failed to fetch" ? error.message : fallback;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * 秩序声明（requiredEvidence）到证据 documentType 的映射。
 * 服务端不校验 documentType 与待办声明的关系；上传前必须在这里解析，
 * 解析不出就显式报错，禁止退回任何默认值错标证据元数据。
 */
export const EVIDENCE_DOCUMENT_TYPE_BY_LABEL: Readonly<Record<string, string>> = {
  "报关单": "customs_declaration",
  "提单": "bill_of_lading",
  "验收单": "acceptance_certificate",
  "检验报告": "inspection_report",
  "发票": "invoice"
};

export type TaskEvidenceTypeResolution =
  | { readonly status: "resolved"; readonly documentType: string; readonly businessLabel: string }
  | { readonly status: "empty" }
  | { readonly status: "unmapped"; readonly labels: readonly string[] }
  | { readonly status: "ambiguous"; readonly labels: readonly string[]; readonly documentTypes: readonly string[] };

export function resolveTaskEvidenceType(requiredEvidence: readonly string[]): TaskEvidenceTypeResolution {
  const labels = requiredEvidence.map((item) => item.trim()).filter((item) => item.length > 0);
  if (labels.length === 0) {
    return { status: "empty" };
  }
  const resolved = new Map<string, string>();
  const unmapped: string[] = [];
  for (const label of labels) {
    const documentType = EVIDENCE_DOCUMENT_TYPE_BY_LABEL[label];
    if (documentType) {
      resolved.set(label, documentType);
    } else {
      unmapped.push(label);
    }
  }
  if (resolved.size === 0) {
    return { status: "unmapped", labels: unmapped };
  }
  const documentTypes = [...new Set(resolved.values())];
  if (documentTypes.length > 1) {
    return { status: "ambiguous", labels: [...resolved.keys()], documentTypes };
  }
  const firstEntry = [...resolved.entries()][0];
  if (!firstEntry) {
    return { status: "empty" };
  }
  const [businessLabel, documentType] = firstEntry;
  return { status: "resolved", documentType, businessLabel };
}

/** 与后端 Evidence Service 一致的限制：仅 PDF，解码后最大 10MB（HTTP body 上限 16MB）。 */
export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_FILE_ACCEPT = "application/pdf,.pdf";

export function validateEvidenceFile(file: { readonly size: number; readonly name: string; readonly type: string }): string | undefined {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return "仅支持 PDF 格式的凭证文件";
  }
  if (file.size > EVIDENCE_MAX_FILE_BYTES) {
    return "凭证文件超过 10MB，请压缩或拆分后再上传";
  }
  if (file.size <= 0) {
    return "凭证文件内容为空，请重新选择";
  }
  return undefined;
}

/** 待办凭证上传时随文件采集的补充字段；报关单号、出口港口、完成时间为必填。 */
export interface TaskEvidenceFieldValues {
  readonly referenceNo: string;
  readonly exportPort: string;
  readonly completionDate: string;
  readonly notes: string;
}

export const emptyTaskEvidenceFieldValues: TaskEvidenceFieldValues = {
  referenceNo: "",
  exportPort: "",
  completionDate: "",
  notes: ""
};

export const TASK_EVIDENCE_REQUIRED_FIELD_LABELS = ["报关单号", "出口港口", "完成时间"] as const;

export function missingTaskEvidenceFieldLabels(values: TaskEvidenceFieldValues): readonly string[] {
  const missing: string[] = [];
  if (!values.referenceNo.trim()) {
    missing.push("报关单号");
  }
  if (!values.exportPort.trim()) {
    missing.push("出口港口");
  }
  if (!values.completionDate.trim()) {
    missing.push("完成时间");
  }
  return missing;
}
