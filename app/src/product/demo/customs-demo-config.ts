import type { TaskEvidenceSpecDTO } from "@uvp-eth/product-dto";

/**
 * 演示配置数据（仅演示用途）。
 *
 * 形态上等同「某个凝结核随 zhixu 自带的任务证据配置」：商店核心代码不包含
 * 这里的任何业务字段、中文标签或文件格式特判，只按 evidenceSpec 通用渲染。
 * 本文件是配置样例，不是商店框架的一部分；更换凝结核配置即可渲染完全不同的
 * 业务待办。与 uvp-protocol fixtures 中的 demoCustomsEvidenceSpec 保持同形。
 */
export interface CustomsDemoTaskConfig {
  readonly taskId: string;
  readonly evidenceSpec: readonly TaskEvidenceSpecDTO[];
}

export const CUSTOMS_DEMO_TASK_ID = "task-2001";

export const customsDemoTaskConfig: CustomsDemoTaskConfig = {
  taskId: CUSTOMS_DEMO_TASK_ID,
  evidenceSpec: [
    {
      key: "customs_declaration_pdf",
      label: "报关单 PDF",
      inputKind: "file",
      accept: ["application/pdf", ".pdf"],
      required: true,
      description: "海关报关单扫描件，仅支持 PDF。"
    },
    {
      key: "customs_declaration_no",
      label: "报关单号",
      inputKind: "text",
      required: true
    },
    {
      key: "export_port",
      label: "出口港口",
      inputKind: "text",
      required: true
    },
    {
      key: "completion_date",
      label: "完成时间",
      inputKind: "date",
      required: true
    }
  ]
};
