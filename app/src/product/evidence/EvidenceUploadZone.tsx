// 凭证上传槽位：原 ProductWorkbenchApp.tsx 的 EvidenceUploadZone（纯搬迁）。
// 上传/核验状态由 workbench 的 useTaskSubmissionFlow 提供。
import { FileText, UploadCloud } from "lucide-react";
import type { EvidenceObjectDTO, EvidenceProofDTO } from "../api";
import { acceptAttribute, acceptHint, type TaskEvidenceSlot } from "../workbench/workbenchSupport";
import { shortHash } from "../../shared/frontend";
import { InlineEmpty, StatusText } from "../workbench/WorkbenchWidgets";

export function EvidenceUploadZone({
  slot,
  uploaded,
  proof,
  uploading,
  onFileSelected
}: {
  slot: TaskEvidenceSlot;
  uploaded?: EvidenceObjectDTO | undefined;
  proof?: EvidenceProofDTO | undefined;
  uploading: boolean;
  onFileSelected: (file: File) => void;
}) {
  const acceptValue = acceptAttribute(slot.accept);
  // 核验异常必须以异常态呈现：隔离凭证不能与正常上传一样显示成功色调。
  const verification = proof?.verificationStatus;
  const verificationAlert = verification === "mismatch" || verification === "missing_file";
  return (
    <div data-testid={`task-evidence-slot-${slot.key}`}>
      {slot.description ? <p className="page-subtitle">{slot.description}</p> : null}
      <label
        className={`upload-zone ${uploading ? "is-uploading" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          // 拖拽与点击选择走同一条上传校验路径；槽位级串行化守卫在上传
          // 进行中一并拦住拖拽换文件（晚到的旧上传不得覆盖新选择，反之亦然）。
          event.preventDefault();
          if (uploading) {
            return;
          }
          const file = event.dataTransfer.files?.[0];
          if (file) {
            onFileSelected(file);
          }
        }}
      >
        <UploadCloud />
        <strong>{slot.label}</strong>
        <span>{uploading ? "正在上传当前文件，完成后才能更换文件" : `将文件拖拽到此处，或点击选择文件；${acceptHint(slot.accept)}，单个文件不超过 10MB`}</span>
        <input
          className="sr-only"
          type="file"
          data-testid={`task-file-input-${slot.key}`}
          disabled={uploading}
          {...(acceptValue ? { accept: acceptValue } : {})}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              onFileSelected(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </label>
      {uploaded ? (
        <div className="uploaded-file">
          <FileText />
          <div>
            <strong>{uploaded.fileName}</strong>
            <span>{formatBytes(uploaded.size)} · 指纹 {shortHash(uploaded.payloadHash)}</span>
          </div>
          {verification === "matched" ? (
            <StatusText tone="ok">已绑定</StatusText>
          ) : verificationAlert ? (
            <StatusText tone="warn" testId="task-evidence-verification-alert">
              {verification === "mismatch" ? "核验不一致：内容与指纹不符，需重新上传" : "核验失败：凭证文件缺失，需重新上传"}
            </StatusText>
          ) : (
            <StatusText tone="ok">已上传 · 已生成凭证指纹</StatusText>
          )}
        </div>
      ) : (
        <InlineEmpty text={`尚未上传「${slot.label}」`} />
      )}
    </div>
  );
}


function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
