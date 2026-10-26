# AGENTS.md

面向在本仓库工作的 AI agent 与新成员。先读这一页，再动代码。

## 仓库定位

`zhixu-registry` 是非用户面的数据登记层（原 `zhixu-store` 的商店/运营台 UI 已删除）。
仓库只有一个包：

- `registry/`：`@uvp-eth/zhixu-registry` —— `ZhixuRecord`（zhixu 自述登记）与
  `IdentityClaim`（钱包身份自述）的库形态数据层。EIP-712 `UVPZhixuRegistry/1`、
  写时验签、append-only Postgres store + migrations、opaque attestation refs。

边界与不做事项见 [STORE-CHARTER.md](./STORE-CHARTER.md)；包内说明见
[registry/README.md](./registry/README.md)。

## 硬规则

1. **不加用户面。** 无 UI、无 HTTP server、无 marketplace/推荐/排序/审核/审批流程。
2. **不审核、不背书、不治理。** schema/API 禁止 approval/status/curation/verified/
   KYC/KYB 字段；登记 permissionless，登记 ≠ 背书。
3. **写必须验签。** 任何写路径先验 EIP-712 签名；签名不符显式失败；只追加、
   唯一键、重复报错，不提供 update/approve。
4. **不当事实来源。** 不解释合约、不裁决真伪、不参与订单授权；attestation 只存
   opaque refs，不存正文/密钥/凭据。
5. **无兼容层。** 删除即删除：不保留旧 app、旧 store 字段、旧接口 re-export。
6. **公共接口变更要同步。** schema、EIP-712 类型、错误码变化需同时更新 README、
   迁移与测试。
7. **不跑 git。** 提交由 Lead 统一做。
8. **测试从简。** 行为聚焦；不写回声/基建机械测试；PG 测试用独立 schema 并清理。

## 与上游关系

协议本体（`uvp-core`/`uvp-protocol`/`uvp-chain-services`）是上游；本仓只消费公开
DTO/类型，不反向依赖、不跨仓修改。链上事实只来自合约与事件，本仓不解释合约行为。

## 验证命令

```bash
pnpm run typecheck
pnpm run test    # 需要 Postgres（默认本机 tmpfs，可用 ZHIXU_REGISTRY_POSTGRES_TEST_URL 覆盖）
pnpm run build
```

伞仓内本地开发：在 `uvp-eth` 根执行 `pnpm install` 后再跑上述命令。
