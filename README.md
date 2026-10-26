# zhixu-registry

非用户面数据登记层（ARCHITECTURE.md §2.3/§4）。原 `zhixu-store` 商店/运营台 UI 已删除，
本仓只保留 `registry/` 包 `@uvp-eth/zhixu-registry`。

Registry 只登记两类记录：

- `ZhixuRecord`：zhixu 自述（`chainId`/`planId`/`planHash`/`descriptorUri|Hash`/
  `schemaHash`/`version`）+ `registeredBy` 钱包签名；
- `IdentityClaim`：钱包自述身份（`wallet`/`subject`/`descriptorUri|Hash`）+
  `wallet` 签名 + 可选 opaque `attestationRefs[]`。

## 边界

- **permissionless**：任何钱包都可登记自己的记录；无 allowlist；登记 ≠ 背书。
- **不审核、不挑选、不排名、不推荐**：不做市场/商店、supplier 审批、join workflow、
  治理投票、KYC/KYB；schema/API 不含 approval/status/curation/verified 字段。
- **不成为事实来源**：只存自述 + 签名 + opaque refs；链上 plan/order/signal 事实以
  合约与链事件为准；身份声明不参与订单授权（授权仍由链上 plan/slot/signal 决定）。
- **不存原件**：attestation 只存 hash/URI/opaque ref；正文、密钥、凭据在 registry 外。
- **只追加**：唯一键 `(chainId, planId, planHash)`、`(chainId, wallet, subject)`；
  重复登记显式报错，无 update/approve 路径。
- **库形态**：无 UI、无 HTTP server；应用/backend 直接 import。

## 包结构

- `registry/src/`：`types` / `canonical` / `verify` / `store` / `postgres`
  （EIP-712 domain/字段表/typed-data 单源在 `@uvp-eth/protocol-bindings`）；
- `registry/migrations/`：Postgres schema；
- `registry/tests/`：注册/读取、非法签名、重复/不可变、permissionless。

详见 [registry/README.md](./registry/README.md) 与 [STORE-CHARTER.md](./STORE-CHARTER.md)。

## 开发与验证

本仓库由 `uvp-eth` 以 git submodule 挂载；本地集成开发在伞仓检出内进行
（`pnpm install` 在伞仓根解析 workspace）。

```bash
pnpm run typecheck
pnpm run test    # 需要 Postgres；默认本机 tmpfs
pnpm run build
```

测试默认使用 `postgres://postgres:test@127.0.0.1:55432/postgres`，可用
`ZHIXU_REGISTRY_POSTGRES_TEST_URL` 覆盖；每次测试建独立 schema 并在结束时删除。

## 与 UVP 本体的关系

协议本体指 `uvp-core`（Rust 语义核）、`uvp-protocol`（合约、编译器、DTO 定义）、
`uvp-chain-services`（链基础设施服务）。Registry 不解释合约行为、不拥有链上事实；
`chain-services` 也不拥有 registry 数据，若需要只做只读投影/事件。
