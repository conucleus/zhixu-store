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
