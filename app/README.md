# Zhixu Store

Zhixu Store 是 UVP 的 **operator（凝结核运营方）面**：设计秩序、组织参与方、看秩序整体概况、
发维护意见信号、生成邀请/分享链接、管理账号与地址。它通过 Chain Services 读取链上事实、
准备交易并提交经营侧数据。

参与者履约面（订单、待办、证据上传、签名提交）**不在本应用**，归 uvp-order-app。
本仓库的 `src/product/**` 仅为迁移冻结保留：源码还在，但入口已从路由移除，页面不可达。

## 定位与路由

只有一面，任何路径都进 Store Console：

| 路径 | 行为 |
| --- | --- |
| `/` | 规整（`history.replaceState`）到 `/store`，渲染运营台 |
| `/store` | 运营台 |
| `/store?join=<zhixuId>` | 邀请链接的加入页（`StoreJoinLinkView`），不在导航中 |
| `/store?share=<zhixuId>` | 分享链接的只读读者页（`StoreShareView`），不在导航中 |
| `/app`、`/orders` 等其它路径 | 不再有参与者工作台，统一落到运营台 |

导航固定为六块：

- **设计**：写秩序（导入草稿、编译、能力插件逐条确认、提交审核）、装修、版本边界；
  试拼沙箱（Docking）作为设计块内的工具入口，不是顶层导航。
- **组织**：在册主体与能力标签、加入申请审核、跳转到链接块。
- **运营**：秩序整体概况（秩序/订单/待办/阻塞计数、索引进度降级）。
- **维护**：规则外异常时生成一条普通意见信号草稿（写路径未接入，显式 fail-closed）。
- **链接**：为 Store 可见秩序生成邀请/分享链接；入口只有链接。
- **账号与地址**：钱包登录/退出、会话锚定、地址表。

**不做**：秩序目录/检索、公开上架（listing）流程、参与者工作台、订单/任务/证据/签名动作、
审计与治理后门。

## 边界

- Plan 的公开发布事实来自 `UVPStateMachine`。
- 线下主体名称与链上账户的映射来自 `UVPIdentityRegistry`。
- 供应商能力、匹配和推荐属于各 Store 自己的链下经营数据。
- Store 对自己的供应商资料和推荐负责；推荐结果停留在 Store 数据域。
- 交易和业务签名遵循对应链上合约的权限规则。
- 参与方与读者只通过链接进入本站的确认/查看页；完整履约动作在订单 app 完成。

## 目录结构

```text
src/
├── app/            # 装配与入口：App.tsx 只有一个 operator 面（/ 与 /store）
├── main.tsx        # Vite 入口（index.html 固定引用 /src/main.tsx）
├── store/          # operator 面（Store Console）
│   ├── StoreApp.tsx            # 运营台壳：会话、六块导航与视图装配
│   ├── api.ts / session.ts / types.ts / wallet.ts   # Store API、会话与类型
│   ├── StoreAccountPage / StoreJoinPage / StoreJoinEntry
│   ├── design/     # 设计块（StoreDesignPage、StoreDesignDetail、插件确认）
│   ├── organization/ # 组织块（在册主体、加入审核）
│   ├── operations/ # 运营块（聚合概况、索引进度）
│   ├── maintenance/# 维护块（普通意见信号草稿）
│   ├── links/      # 链接块（StoreLinkPage）+ 加入页/分享页
│   ├── authoring/  # 装修编辑（StoreDecorationEditor）
│   ├── docking/    # 试拼沙箱（设计块内入口）
│   └── suppliers/  # 供应商资料（组织块内）
├── product/        # 冻结：参与者侧源码，等待迁移到 uvp-order-app（本应用不可达）
├── lib/            # 本仓纯前端工具（frontend.ts：基地址解析、短值显示等）
└── shared/         # frontend-shared submodule（chain 轨单源；本仓只消费
                    # chain/、contracts/、domain/，见该仓 README 分轨边界）
```

`src/product/**` 里仍保留的页面（CreateOrderPage、TaskPage、SubmitPage、ParticipantsPage、
OrderOverviewPage、ProductWorkbenchApp、ZhixuCatalogViews 等）是 order app 迁移的输入，
本仓不新增功能、不改契约；无人引用的残留代码随迁移一并带走。

## 运行

```bash
pnpm install
pnpm run typecheck
pnpm run dev
```

主要环境变量：

- `VITE_UVP_CHAIN_SERVICES_URL`: Chain Services 地址
- `VITE_UVP_ORDER_APP_URL`: uvp-order-app 部署地址。参与方邀请链接（`?invite=&inviteToken=`）的消费逻辑只在 uvp-order-app，本站不读这组参数；缺配置时邀请链接 fail-closed 拒绝生成（不产出死链、不外泄一次性令牌），邀请创建本身不受影响。
- `VITE_UVP_STATE_MACHINE_ADDRESS`: 状态机部署地址，签名域交叉核对的预期值；缺配置或格式非法时拒绝签名。它是构建期钉死的单地址（Vite 内联进产物，运行期改环境变量不生效）：状态机部署轮换（activeDeployment 指针前移）后必须重建前端，签名域门才会按新地址核对；同一时间只支持一个部署地址。`.env.example` 里的示例值是格式非法占位：照抄部署会走"地址未配置"的显式报错分支，而不是以全零地址通过格式门后在每次签名时报"与 0x0… 不一致"。

完整清单与缺省行为见 `.env.example`。前端只读取这些当前变量名。身份只认登录会话与环境变量，仓库不含 mock/demo 运行路径。

## 验证

```bash
pnpm run typecheck
pnpm run build     # tsc --noEmit + vite build
pnpm test          # 单元测试（tsx --test src/**/*.test.ts）
pnpm test:e2e      # Playwright（fixture 全桩，不需要真实链/外部服务）
```

其它 e2e 脚本：

- `pnpm test:e2e:fixture`：operator 面的 fixture 用例集合（入口契约、会话/账号、链接、
  运营信任语义、能力插件逐条确认）。
- `pnpm test:e2e:docking`：试拼沙箱写路径，需要 `UVP_PRODUCT_BROWSER_E2E_STORE_ACCESS_LEVEL=store_operator`
  独立 profile；常规 fixture 跑会整组 skip。
- `pnpm test:e2e:full` / `e2e/product-workbench.*.spec.ts`：参与者工作台的旧用例，
  **整组 skip**。`/app` 已不是参与者入口，这些用例只有在 uvp-order-app 宿主里才有意义；
  迁移时随 `src/product/**` 一起搬走，恢复执行。

E2E 全部使用页面级 stub（`e2e/workbench-stubs.ts` 提供 `STUB_API_BASE`），不依赖真实链。
