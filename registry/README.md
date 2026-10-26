# zhixu-registry

非用户面数据登记层（ARCHITECTURE.md §2.3/§4）：只登记 zhixu 描述与钱包身份声明，
不做商店、审核、推荐、 curation、KYC 或订单授权。

## 边界

- 登记 permissionless：任何钱包都可写入自己的记录；登记 ≠ 背书。
- 写时验签：`ZhixuRecord` 由 `registeredBy` 签名，`IdentityClaim` 由 `wallet` 签名；
  签名覆盖全部登记字段（EIP-712 domain `UVPZhixuRegistry/1` + `chainId`）。
- 只存自述与 opaque refs：`descriptorUri/hash`、`schemaHash`、`version`、
  `attestationRefs[]` 原样登记，不解析、不验证真伪、不存 KYC/KYB 原件。
- 只追加：唯一键 `(chainId, planId, planHash)` 与 `(chainId, wallet, subject)`；
  重复登记报 `RegistryEntryConflictError`，无 update/approve/status 路径。

## 包内容

- `src/types.ts`：`ZhixuRecord` / `IdentityClaim` 及写入输入 DTO。
- `src/eip712.ts`：domain/类型/签名消息单源，并导出 `zhixuRecordTypedData` /
  `identityClaimTypedData` 供调用方签名。
- `src/verify.ts`：写时验签（失败抛 `RegistrySignatureError`）。
- `src/store.ts`：`ZhixuRegistryStore` 存储接口。
- `src/postgres/store.ts`：Postgres 实现（注入 `pg.Pool`）。
- `src/postgres/migrate.ts` + `migrations/`：按连接当前 `search_path` 应用 schema。
- `tests/registry.test.ts`：注册/读取、非法签名、重复/不可变、permissionless。

无 UI、无 HTTP server；应用或 backend 直接 import。

## 用法

```ts
import { Pool } from "pg";
import {
  PostgresZhixuRegistryStore,
  runRegistryMigrations,
  zhixuRecordTypedData
} from "@uvp-eth/zhixu-registry";

const pool = new Pool({ connectionString });
await runRegistryMigrations(pool);
const registry = new PostgresZhixuRegistryStore({ pool });

const fields = { chainId, planId, planHash, descriptorUri, registeredBy: wallet };
const signature = await account.signTypedData(zhixuRecordTypedData(fields));
await registry.registerZhixuRecord({ ...fields, signature });
```

## 验证

```bash
pnpm --filter @uvp-eth/zhixu-registry run typecheck
pnpm --filter @uvp-eth/zhixu-registry run test
```

测试需要 Postgres；`test` 默认用本机 tmpfs
`postgres://postgres:test@127.0.0.1:55432/postgres`，可用
`ZHIXU_REGISTRY_POSTGRES_TEST_URL` 覆盖。测试每次建独立 schema 并在结束时删除。
