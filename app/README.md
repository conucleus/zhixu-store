# Zhixu Store

Zhixu Store 是 UVP 的 **operator（凝结核运营方）面**：设计秩序、组织参与方、看秩序整体概况、
发维护意见信号、生成邀请/分享链接、管理账号与地址。它通过 Chain Services 读取链上事实、
准备交易并提交经营侧数据。

参与者履约面（订单、待办、证据上传、签名提交）**不在本应用**，归 uvp-order-app。
历史上冻结在 `src/product/**` 的参与者工作台源码与旧 e2e 载荷已删除；本仓只保留 operator 面，
不再维护第二份参与者实现。迁移缺口见下文「迁移缺口」。

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
├── lib/            # 本仓纯前端工具（frontend.ts：基地址解析、短值显示等）
└── shared/         # frontend-shared submodule（chain 轨单源；本仓只消费
                    # chain/、contracts/、domain/，见该仓 README 分轨边界）
```

## 迁移缺口（归 uvp-order-app）

删除前已逐文件核对 order app 的覆盖情况；以下能力在 order app 尚无等价物，需后续补齐
（本仓不再为它们保留冻结实现）：

- **参与方替换/补位**：store 版 `ParticipantsPage` 对已邀请但未确认的参与方提供「替换」动作；
  order app `src/orders` 只覆盖开单与邀请发送（生成邀请链接），没有替换/补位入口。
- **多接口诊断面板**：store 版工作台在多个 `/product/*` 接口同时失败时聚合为诊断面板
  （`WorkbenchEndpointDiagnostic`）；order app 当前只有单条加载错误横幅，没有按接口列出的诊断视图。

其余参与者面已由 order app 覆盖：创建订单/邀请 → `src/orders`；任务、提交、证据 →
`src/tasks`、`src/evidence`；订单总览 → `src/order-room`；实体登记 → `src/registration`；
钱包登录 → `src/onboarding/WalletLoginPanel`。

## 运行

```bash
pnpm install
pnpm run typecheck
pnpm run dev
```

主要环境变量：

- `VITE_UVP_CHAIN_SERVICES_URL`: Chain Services 地址（Store Console 的读写 API）。
- `VITE_UVP_STORE_ACCESS_LEVEL`: 可选，本地开发访问级别（缺省 `anonymous_read`）。
- `VITE_UVP_STORE_FETCH_TIMEOUT_MS`: 可选，读写超时毫秒（缺省 6000）。

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

E2E 全部使用页面级 stub（`e2e/stub-api.ts` 提供 `STUB_API_BASE`），不依赖真实链。
