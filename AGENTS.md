# 大光路 P0 UI 研发入口

当前阶段：PREP-01 / IN_PROGRESS / NOT FROZEN。本仓以 `manager/` 为 P0 平台管理 Web 基础，保留独立 Git 历史和原有前端工程结构。

## 1. 开工必读

跨仓任务必须显式读取以下资料；兄弟仓 AGENTS 不会自动适用于本仓：

1. [总体需求大纲 V1.0](../project-ops/docs/product/source/00_大光路智慧社区_P0商城闭环_总体需求大纲_V1.0.md)：最高业务原则。
2. [正式开发总清单 V1.1](../project-ops/docs/product/current/01_大光路智慧社区_P0商城闭环_产品开发总清单_V1.1.md)：当前 APPROVED / CURRENT 产品清单。
3. 当前批准的阶段设计、PLAN、ACCEPTANCE 和测试用例；资料缺失时记录，不从旧页面或 Mock 推断正式范围。
4. [项目级 AGENTS](../project-ops/AGENTS.md) 与本 AGENTS；产品身份和 SHA 见[产品基线清单](../project-ops/docs/product/PRODUCT_BASELINE_MANIFEST.md)及[release-lock](../project-ops/release-lock.yml)。
5. 源码调查及实现事实。历史总清单和 DRAFT 仅用于追溯。

## 2. Web 工程与权限

- LiLiShop Manager 原菜单、按钮及功能不自动属于已批准 P0；按正式功能编号和当前阶段范围实施，不擅自删除现有功能或扩展其他子工程。
- Backend API 是业务事实来源；页面状态、金额单位、错误处理和操作前置条件与服务端契约一致，不以本地模拟成功替代真实结果。
- 菜单、按钮、角色和数据范围须与服务端授权一致；前端隐藏不构成后端授权，关键操作仍由服务端复核身份、Store/Member 归属及状态。
- 保留现有 Manager 技术栈、页面、路由和构建结构；结构、依赖或公共配置调整先分析影响并获得当前任务授权。

## 3. 固定来源与执行边界

初始源码基线为 `1750f04d0bb2de48c45137e36fe37a770d0263f5`；[LiLiShop UI 官方仓库](https://github.com/lilishop/lilishop-ui)仅作来源追溯。本项目独立演进，只保留项目 origin；不配置官方 upstream，不自动拉取、同步或合并官方分支。保留原始 Git 历史、LICENSE 和版权；升级及安全修复须依据批准的项目任务。

先检查根目录、分支、HEAD、origin、工作区和暂存区；未知改动原样保护，不自动 reset、clean、stash 或切换分支。只读 Git 使用 `git --no-optional-locks`，必要时仅本次命令关闭 fsmonitor，不改持久配置。

未经当前任务授权，不安装依赖、构建/启动服务、修改生产配置、调用正式资金渠道、提交/推送 Git、调整远端或部署；示例配置与外部演示 API 不是本项目隔离环境。凭据和真实个人信息不得写入文档、日志或提交。自动化、构建、浏览器、人工与真实联调分别记录，不能代签人工 PASS。产品批准不替代运行兼容或商业许可评估，F01-08 仍 BLOCKED；结束后不自行进入 PREP-02 或 Stage 0。
