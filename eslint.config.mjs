import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // JavaScript 基础推荐规则，覆盖配置文件和普通脚本。
  js.configs.recommended,
  // TypeScript 推荐规则，覆盖 apps/packages 中的 .ts/.tsx。
  ...tseslint.configs.recommended,
  {
    // 构建产物和依赖目录不参与 lint，避免扫描生成文件或第三方代码。
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 项目中 HTTP/WebSocket 边界处会接收未知 JSON/表单数据，暂时允许 any 降低样板代码。
      '@typescript-eslint/no-explicit-any': 'off',
      // 允许以下划线开头的参数作为“必须保留但当前未使用”的占位参数。
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
