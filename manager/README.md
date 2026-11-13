# LILISHOP-UI

公司 TEST／Mock 环境使用以下构建入口，保持正常账号、验证码和原生授权。配套部署说明位于后端仓 `deployment/uat-schema/DEPLOYMENT.md`。

```sh
yarn install --frozen-lockfile --non-interactive --ignore-engines
npm run build:wechat-test -- --output /srv/dgl-web/manager-001
```

输出目录必须是仓库外的新目录，生成的 `config.js` 使用同源 `/api`。由公司反向代理将 manager、store、buyer、common 路径分别指向同一 run 的 API；禁止把旧演示 API 或本机测试登录配置带入公司环境。

### Customize configuration
详情点击 [https://cli.vuejs.org/zn/config/](https://cli.vuejs.org/zn/config/).

正常登录和页面权限检查按当前代码执行，不按旧版本的行号修改来跳过认证。

#### main-parts  头部，左侧所有内容

#### decoration  楼层装修模块
     
