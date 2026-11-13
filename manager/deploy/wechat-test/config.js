// Runtime configuration for the isolated company TEST/MOCK environment.
// Serve this file as /config.js alongside the Manager build. The reverse proxy
// must route /api to the APIs belonging to the same test run.
var BASE = {
  stage0ManagerSessionEnabled: true,
  stage1Enabled: true,
  p0IntegrationEnabled: true,
  stage1WebUsabilityEnabled: true,
  stage2Enabled: true,
  stage2WebUiEnabled: true,
  stage3Enabled: true,
  stage45Enabled: true,
  API_DEV: { common: "/api", buyer: "/api", seller: "/api", manager: "/api" },
  API_PROD: { common: "/api", buyer: "/api", seller: "/api", manager: "/api" },
  PREFIX: "/manager",
  PC_URL: "",
  WAP_URL: ""
};
