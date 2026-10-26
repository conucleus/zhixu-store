# Registry Charter（zhixu-registry 定位与边界）

本文是 `zhixu-registry` 的边界章程：这个组件做什么、不做什么、新需求如何归类。
任何新功能先对照本文归类；归类不进去的，要么修订本文（边界变更），要么拒绝。
原 `zhixu-store` 商店/运营台（上架、目录、供应商审批、入驻、装修、对接、运维）已删除，
其用户面与审核流程不属于本组件。

## 1. 定位

**Registry 是非用户面的数据登记层，不是商店、不是市场、不是审核台。**

对应关系（仅作定位参照）：

| 概念 | 本组件 |
| --- | --- |
| 用户面 | 无（应用/backend 是消费者） |
| 登记对象 | `ZhixuRecord`（zhixu 自述）、`IdentityClaim`（钱包身份自述） |
| 事实来源 | 链上合约与事件；registry 只存自述、签名与 opaque refs |
| 可信性 | 由签名与外部 attestation 表达；registry 不做裁定 |

## 2. 永久红线

1. **不做用户面。** 无 UI、无 HTTP server、无 marketplace/推荐/排序/评论/SEO。
2. **不审核、不背书、不治理。** schema 与 API 禁止出现 approval/status/curation/
   recommendation/verified/KYC/KYB 字段或流程；登记 permissionless，登记 ≠ 背书。
3. **不成为事实来源。** 不解释合约、不裁决真伪、不参与订单授权；身份声明只是自述。
4. **不存业务原件。** attestation 只存 hash/URI/opaque ref；正文、密钥、凭据在组件外。
5. **只追加。** 无 update/approve/reject 路径；重复登记显式失败。

## 3. 写/读不变量

写：

- EIP-712 domain `UVPZhixuRegistry/1` + `chainId`，签名覆盖全部登记字段；
- `ZhixuRecord` 必须由 `registeredBy` 签名，`IdentityClaim` 必须由 `wallet` 签名；
- 唯一键 `(chainId, planId, planHash)` 与 `(chainId, wallet, subject)`；重复登记
  抛 `RegistryEntryConflictError`，先写入的记录不可变。

读：

- 只提供按 key 的最小读取；返回 `registeredBy`/`signature`/`attestationRefs`；
- 不返回 verified/approved/trust score；不提供列表排序/推荐入口。

## 4. 明确不做

商店/市场/撮合/推荐/排名、supplier 审批、join/邀请 workflow、治理投票、KYC/KYB
原件、托管/交易/资金、订单授权、用户面展示。邀请是应用或 plan 创建者的签名消息，
不在 registry 内做 workflow。

## 5. 新需求归类

只接受：登记数据结构、EIP-712 签名规范、存储/迁移、最小 read/verify 接口、
opaque attestation refs。其余需求归应用、backend 或链基础设施，不在本组件实现。

## 6. Phase C 迁移状态

前端 `app/` 已删除，本仓只留 `registry/`。旧 listing/supplier 数据如需保留，由应用侧
映射为 `ZhixuRecord`/`IdentityClaim` 或直接丢弃重建；审批/身份登记/KYC 流程不迁移。
