// 统一导出前后端共享契约。这里保留 .js 后缀是为了让 TypeScript 编译后的 ESM
// 产物符合 Node.js 的模块解析规则，避免运行时查找 extensionless 文件失败。
export * from './schemas.js';
export * from './realtime.js';
