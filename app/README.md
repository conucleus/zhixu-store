# Zhixu Store

Zhixu Store 是 UVP 的链下经营入口。它面向现实中的机构与人员展示可读名称、资料和工作流，并通过 Chain Services 读取链上事实、准备交易和提交经营侧数据。

## 页面

- 秩序目录和详情：浏览已发布 Plan 与运行状态。
- 秩序草稿：导入、编辑、校验、编译和准备发布。
- 供应商：维护链下主体资料、能力标签、内部记录和搜索数据。
- Docking：把现实业务材料整理成凝结核工作流。
- Runtime：查看当前部署、模块、索引和服务状态。
- Product Workbench：从参与者视角查看 Order、Task、证据和可执行动作。

## 边界

- Plan 的公开发布事实来自 `UVPStateMachine`。
- 线下主体名称与链上账户的映射来自 `UVPIdentityRegistry`。
- 供应商能力、匹配和推荐属于各 Store 自己的链下经营数据。
- Store 对自己的供应商资料和推荐负责；推荐结果停留在 Store 数据域。
- 交易和业务签名遵循对应链上合约的权限规则。

## 运行

```bash
pnpm install
pnpm run typecheck
pnpm run dev
```

主要环境变量：

- `VITE_UVP_CHAIN_SERVICES_URL`: Chain Services 地址
- `VITE_UVP_ORDER_APP_URL`: uvp-order-app 部署地址。参与方邀请链接（`?invite=&inviteToken=`）的消费逻辑只在 uvp-order-app，本站不读这组参数；缺配置时邀请链接 fail-closed 拒绝生成（不产出死链、不外泄一次性令牌），邀请创建本身不受影响。
- `VITE_UVP_STATE_MACHINE_ADDRESS`: 状态机部署地址，签名域交叉核对的预期值；缺配置时拒绝签名。

完整清单与缺省行为见 `.env.example`。前端只读取这些当前变量名。身份只认登录会话与环境变量，仓库不含 mock/demo 运行路径。

## 验证

```bash
pnpm run typecheck
pnpm run build
pnpm run test:e2e
```

E2E 测试验证当前页面、权限和业务流，不承担开发历史记录。
