# zhixu-registry

非用户面数据登记层（ARCHITECTURE.md §2.3/§4）：只登记 zhixu 描述与钱包身份声明。
permissionless、登记 ≠ 背书（no endorsement）；不做商店、审核、curation、推荐、KYC、
订单授权或用户面。

## 边界

- 登记 permissionless：任何钱包都可写入自己的记录；无 allowlist，登记 ≠ 背书。
- 写时验签：`ZhixuRecord` 由 `registeredBy` 签名，`IdentityClaim` 由 `wallet` 签名；
  签名覆盖全部登记字段（EIP-712 domain `UVPZhixuRegistry/1` + `chainId`）。
- 只存自述与 opaque refs：`descriptorUri/hash`、`schemaHash`、`version`、
  `attestationRefs[]` 原样登记，不解析、不验证真伪、不存 KYC/KYB 原件。
- 只追加：唯一键 `(chainId, planId, planHash)` 与 `(chainId, wallet, subject)`；
  重复登记报 `RegistryEntryConflictError`，无 update/approve/status 路径。
- 读取只返回登记内容与 `registeredBy`/`signature`/`attestationRefs`，不返回
  verified/approved/trust score，不做排序或推荐。
- 库形态：无 UI、无 HTTP server；应用或 backend 直接 import。

## 包入口

- `@uvp-eth/zhixu-registry`：根入口（Node/backend）。类型、验签、
  `ZhixuRegistryStore` 接口、Postgres store 与 migrations。
- EIP-712 domain/types 单源在 `@uvp-eth/protocol-bindings`
  （`UVPZhixuRegistry/1`、`ZhixuRecord`/`IdentityClaim` 字段表与 type hash、
  typed-data 构造与字段规范化）；registry 不再提供 `/eip712` 子路径，
  client/apps 直接从 protocol-bindings 构造待签名消息。

```ts
import { buildZhixuRecordTypedData } from "@uvp-eth/protocol-bindings";

const typedData = buildZhixuRecordTypedData(fields);
const signature = await account.signTypedData(typedData);
```

## 包内容

- `src/types.ts`：`ZhixuRecord` / `IdentityClaim` 及写入输入 DTO。
- `src/canonical.ts`：registry 输入/键规范化包装（字段规则单源在
  protocol-bindings）与签名格式校验。
- `src/verify.ts`：写时验签（失败抛 `RegistrySignatureError`）。
- `src/store.ts`：`ZhixuRegistryStore` 接口；`register*` 是签名写入 API。
- `src/postgres/store.ts`：Postgres 实现（注入 `pg.Pool`），INSERT 前验签。
- `src/postgres/migrate.ts` + `migrations/`：按连接当前 `search_path` 应用 schema。
- `tests/registry.test.ts`：注册/读取、非法签名、重复/不可变、permissionless。

## 签名写入

写入通过 `ZhixuRegistryStore`，签名先于写入校验：

- `registerZhixuRecord({ ...fields, signature })`：按 `registeredBy` 验 EIP-712 签名后 INSERT；
- `registerIdentityClaim({ ...fields, signature })`：按 `wallet` 验签后 INSERT。

签名不符或不可解析抛 `RegistrySignatureError`（`registry_signature_invalid`），不落库；
重复键抛 `RegistryEntryConflictError`。没有 approve/reject/status 路径，也没有额外审批。

## 用法

```ts
import { Pool } from "pg";
import {
  PostgresZhixuRegistryStore,
  runRegistryMigrations
} from "@uvp-eth/zhixu-registry";
import { buildZhixuRecordTypedData } from "@uvp-eth/protocol-bindings";

const pool = new Pool({ connectionString });
await runRegistryMigrations(pool);
const registry = new PostgresZhixuRegistryStore({ pool });

const fields = { chainId, planId, planHash, descriptorUri, registeredBy: wallet };
const signature = await account.signTypedData(buildZhixuRecordTypedData(fields));
const record = await registry.registerZhixuRecord({ ...fields, signature });
console.log(record.registeredBy, record.signature);
```

## 验证

```bash
pnpm --filter @uvp-eth/zhixu-registry run typecheck
pnpm --filter @uvp-eth/zhixu-registry run test
```

测试需要 Postgres；`test` 默认用本机 tmpfs
`postgres://postgres:test@127.0.0.1:55432/postgres`，可用
`ZHIXU_REGISTRY_POSTGRES_TEST_URL` 覆盖。测试每次建独立 schema 并在结束时删除。
