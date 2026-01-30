// 运行时配置
window.appConfig = {
  // eco-guide 的 /drive Pages Functions 会反向代理 CloudPaste（同源）。
  // CloudPaste 前端需要把 API 请求发送到 /drive/api/*（而不是 /api/*）。
  backendUrl: "/drive",
};
