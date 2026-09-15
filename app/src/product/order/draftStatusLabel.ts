// 订单草稿状态标签：CreateOrderPage 与 ParticipantsPage 共用（原 ProductWorkbenchApp.tsx，纯搬迁）。
import type { ProductOrderDraftDTO } from "../api";

export function draftStatusLabel(status: ProductOrderDraftDTO["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "awaiting_participants":
      return "等待参与方";
    case "ready_to_trigger":
      return "可启动";
    case "triggering":
      return "启动中";
    case "triggered":
      return "已启动";
    case "failed":
      return "启动失败";
    case "cancelled":
      return "已取消";
  }
}
