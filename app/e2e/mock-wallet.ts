import { expect, test as base, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { isRecord } from "../src/shared/frontend";

export const mockWalletPrivateKey =
  "0x59c6995e998f97a5a0044966f094538864e17c8b7e37a2c115d7e4cc795fb0c1" satisfies Hex;
export const mockWalletAccount = privateKeyToAccount(mockWalletPrivateKey);
export const defaultMockChainId = "0x7a69";

export interface MockWalletStatePatch {
  readonly accounts?: readonly string[];
  readonly chainId?: string;
  readonly rejectSignTypedData?: boolean;
  readonly unauthorized?: boolean;
}

export interface MockWalletControls {
  readonly address: string;
  readonly chainId: string;
  setState(patch: MockWalletStatePatch): Promise<void>;
  requestLog(): Promise<readonly MockWalletRequest[]>;
}

export interface MockWalletRequest {
  readonly method: string;
  readonly params?: unknown;
}

type Eip712ForSmoke = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
  };
  readonly types: {
    readonly ProductTaskSubmit: readonly [
      { readonly name: "taskId"; readonly type: "string" },
      { readonly name: "evidenceFingerprint"; readonly type: "bytes32" },
      { readonly name: "walletAddress"; readonly type: "address" },
      { readonly name: "deadline"; readonly type: "string" }
    ];
  };
  readonly primaryType: "ProductTaskSubmit";
  readonly message: {
    readonly taskId: string;
    readonly evidenceFingerprint: Hex;
    readonly walletAddress: Hex;
    readonly deadline: string;
  };
};

type Fixtures = {
  readonly apiTranscript: void;
  readonly mockWallet: MockWalletControls;
};

declare global {
  interface Window {
    readonly ethereum: {
      request(args: { readonly method: string; readonly params?: unknown[] }): Promise<unknown>;
    };
  }
}

export const test = base.extend<Fixtures>({
  apiTranscript: [async ({ page }, use, testInfo) => {
    const entries: ApiTranscriptEntry[] = [];
    page.on("request", (request) => {
      if (!shouldRecordApiUrl(request.url())) {
        return;
      }
      entries.push({
        type: "request",
        method: request.method(),
        url: request.url(),
        timestamp: new Date().toISOString()
      });
    });
    page.on("response", (response) => {
      if (!shouldRecordApiUrl(response.url())) {
        return;
      }
      entries.push({
        type: "response",
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        timestamp: new Date().toISOString()
      });
    });
    page.on("requestfailed", (request) => {
      if (!shouldRecordApiUrl(request.url())) {
        return;
      }
      entries.push({
        type: "requestfailed",
        method: request.method(),
        url: request.url(),
        error: request.failure()?.errorText ?? "request_failed",
        timestamp: new Date().toISOString()
      });
    });

    await use();

    const runRoot = process.env.UVP_STORE_E2E_RUN_ROOT;
    if (!runRoot) {
      return;
    }
    const transcriptDir = `${runRoot}/api-transcript`;
    await mkdir(transcriptDir, { recursive: true });
    const path = `${transcriptDir}/${safeArtifactName(testInfo.title)}.json`;
    const body = Buffer.from(JSON.stringify({
      testTitle: testInfo.title,
      entries
    }, null, 2));
    await writeFile(path, body);
    await testInfo.attach("api-transcript", {
      body,
      contentType: "application/json"
    });
  }, { auto: true }],
  mockWallet: async ({ page }, use) => {
    const controls = await installMockWallet(page);
    await use(controls);
  }
});

export { expect };

export async function installMockWallet(
  page: Page,
  patch: MockWalletStatePatch = {}
): Promise<MockWalletControls> {
  await page.exposeFunction("__uvpMockWalletSignTypedData", async (address: string, typedData: unknown) => {
    if (address.toLowerCase() !== mockWalletAccount.address.toLowerCase()) {
      throw new Error("unauthorized_wallet");
    }
    return await mockWalletAccount.signTypedData(normalizeTypedData(typedData));
  });

  await page.addInitScript(
    ({ accountAddress, chainId, initialPatch }) => {
      type RequestArgs = {
        readonly method: string;
        readonly params?: unknown[];
      };
      type State = {
        accounts: string[];
        chainId: string;
        rejectSignTypedData: boolean;
        unauthorized: boolean;
        requests: Array<{ method: string; params?: unknown }>;
      };
      type EthereumProvider = {
        isMetaMask: boolean;
        request(args: RequestArgs): Promise<unknown>;
        on(event: string, listener: (...args: unknown[]) => void): void;
        removeListener(event: string, listener: (...args: unknown[]) => void): void;
      };

      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const state: State = {
        accounts: [accountAddress],
        chainId,
        rejectSignTypedData: false,
        unauthorized: false,
        requests: []
      };

      function applyPatch(patch?: Partial<State>) {
        if (!patch) {
          return;
        }
        if (patch.accounts) {
          state.accounts = [...patch.accounts];
        }
        if (patch.chainId) {
          state.chainId = patch.chainId;
        }
        if (typeof patch.rejectSignTypedData === "boolean") {
          state.rejectSignTypedData = patch.rejectSignTypedData;
        }
        if (typeof patch.unauthorized === "boolean") {
          state.unauthorized = patch.unauthorized;
        }
      }

      function emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) {
          listener(...args);
        }
      }

      function walletError(code: number, message: string) {
        return Object.assign(new Error(message), { code });
      }

      const provider: EthereumProvider = {
        isMetaMask: true,
        async request(args) {
          state.requests.push({ method: args.method, params: args.params });
          switch (args.method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return state.unauthorized ? [] : [...state.accounts];
            case "eth_chainId":
              return state.chainId;
            case "wallet_switchEthereumChain": {
              const requested = args.params?.[0] as { readonly chainId?: string } | undefined;
              if (!requested?.chainId) {
                throw walletError(4902, "chain_id_required");
              }
              state.chainId = requested.chainId;
              emit("chainChanged", state.chainId);
              return null;
            }
            case "eth_signTypedData_v4": {
              if (state.rejectSignTypedData) {
                throw walletError(4001, "user_rejected_signature");
              }
              const address = typeof args.params?.[0] === "string" ? args.params[0] : state.accounts[0];
              if (state.unauthorized || !address || !state.accounts.some((item) => item.toLowerCase() === address.toLowerCase())) {
                throw walletError(4100, "unauthorized_wallet");
              }
              const rawTypedData = args.params?.[1];
              const typedData = typeof rawTypedData === "string" ? JSON.parse(rawTypedData) : rawTypedData;
              return await (window as unknown as {
                __uvpMockWalletSignTypedData(address: string, typedData: unknown): Promise<string>;
              }).__uvpMockWalletSignTypedData(address, typedData);
            }
            default:
              throw walletError(4200, `unsupported_method:${args.method}`);
          }
        },
        on(event, listener) {
          const eventListeners = listeners.get(event) ?? new Set();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        removeListener(event, listener) {
          listeners.get(event)?.delete(listener);
        }
      };

      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: provider
      });
      Object.defineProperty(window, "__uvpMockWallet", {
        configurable: true,
        value: {
          address: accountAddress,
          state,
          setState: applyPatch,
          requestLog: () => [...state.requests]
        }
      });
      applyPatch(initialPatch);
    },
    {
      accountAddress: mockWalletAccount.address,
      chainId: patch.chainId ?? defaultMockChainId,
      initialPatch: {
        ...patch,
        accounts: patch.accounts ?? [mockWalletAccount.address]
      }
    }
  );

  return {
    address: mockWalletAccount.address,
    chainId: patch.chainId ?? defaultMockChainId,
    async setState(nextPatch) {
      await page.evaluate((statePatch) => {
        (window as unknown as {
          __uvpMockWallet: {
            setState(patch: MockWalletStatePatch): void;
          };
        }).__uvpMockWallet.setState(statePatch);
      }, nextPatch);
    },
    async requestLog() {
      return await page.evaluate(() =>
        (window as unknown as {
          __uvpMockWallet: {
            requestLog(): readonly MockWalletRequest[];
          };
        }).__uvpMockWallet.requestLog()
      );
    }
  };
}

export function smokeTypedData(walletAddress: string): Eip712ForSmoke {
  return {
    domain: {
      name: "UVP Product Workbench",
      version: "1",
      chainId: 31337
    },
    types: {
      ProductTaskSubmit: [
        { name: "taskId", type: "string" },
        { name: "evidenceFingerprint", type: "bytes32" },
        { name: "walletAddress", type: "address" },
        { name: "deadline", type: "string" }
      ]
    },
    primaryType: "ProductTaskSubmit",
    message: {
      taskId: "task-demo-customs-clearance",
      evidenceFingerprint: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      walletAddress: walletAddress as Hex,
      deadline: "2026-05-01T00:00:00.000Z"
    }
  };
}

export async function expectRecoverableTypedDataSignature(signature: string, typedData: Eip712ForSmoke): Promise<void> {
  const recovered = await recoverTypedDataAddress({
    ...typedData,
    signature: signature as Hex
  });
  expect(recovered.toLowerCase()).toBe(typedData.message.walletAddress.toLowerCase());
}

function normalizeTypedData(typedData: unknown) {
  if (!isRecord(typedData)) {
    throw new Error("typed_data_invalid");
  }
  return typedData as Parameters<typeof mockWalletAccount.signTypedData>[0];
}

export async function writeRunScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const runRoot = process.env.UVP_STORE_E2E_RUN_ROOT;
  const safeName = safeArtifactName(name);
  const path = runRoot ? `${runRoot}/screenshots/${safeName}.png` : undefined;
  if (runRoot) {
    await mkdir(`${runRoot}/screenshots`, { recursive: true });
  }
  const screenshot = await page.screenshot({
    fullPage: true,
    path
  });
  await testInfo.attach(safeName, {
    body: screenshot,
    contentType: "image/png"
  });
}

interface ApiTranscriptEntry {
  readonly type: "request" | "response" | "requestfailed";
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly error?: string;
  readonly timestamp: string;
}

function shouldRecordApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname === "/healthz" || url.pathname.startsWith("/product/");
  } catch {
    return false;
  }
}

function safeArtifactName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
