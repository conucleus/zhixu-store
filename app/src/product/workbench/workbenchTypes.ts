import type { ProductApiSource, ProductSubmissionDTO, PreparedSubmitDTO } from "../api";

export type ProductView =
  | "app"
  | "home"
  | "zhixu"
  | "create"
  | "participants"
  | "order"
  | "task"
  | "submit"
  | "dispute";

export type AsyncPhase = "idle" | "pending" | "success" | "error";

export interface ActionState {
  readonly phase: AsyncPhase;
  readonly message?: string;
  readonly source?: ProductApiSource;
}

export type SubmitMachineStatus =
  | "idle"
  | "preparing"
  | "wallet_not_connected"
  | "wallet_rejected"
  | "signature_pending"
  | "tx_pending"
  | "confirmed"
  | "failed";

export interface SubmitMachineState {
  readonly status: SubmitMachineStatus;
  readonly message: string;
  readonly prepared?: PreparedSubmitDTO;
  readonly submission?: ProductSubmissionDTO;
  readonly source?: ProductApiSource;
}

export const idleAction: ActionState = { phase: "idle" };
