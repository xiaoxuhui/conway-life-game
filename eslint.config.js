// ESLint 9 扁平配置（zero-config 风格）：仅做基础静态检查，不强制代码风格。
// 这些脚本以 <script> 顺序加载，跨文件全局（Life / RendererModule 等）在此显式声明，
// 避免 no-undef 误报。运行：npm run lint（仅本地开发使用，不进入 CI 测试门禁）。
const crossScriptGlobals = {
  Life: "readonly",
  RendererModule: "readonly",
  PatternStore: "readonly",
  FunctionStore: "readonly",
  SpeedControl: "readonly",
  LogicCode: "readonly",
  Presets: "readonly",
};

module.exports = [
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...crossScriptGlobals,
        globalThis: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        process: "readonly",
        performance: "readonly",
        AbortController: "readonly",
        Blob: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        HTMLCanvasElement: "readonly",
        ResizeObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Intl: "readonly",
        Map: "readonly",
        Set: "readonly",
        Math: "readonly",
        Number: "readonly",
        String: "readonly",
        Object: "readonly",
        Array: "readonly",
        JSON: "readonly",
        Error: "readonly",
        RegExp: "readonly",
        Boolean: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly",
        isNaN: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
      "no-duplicate-case": "error",
    },
  },
];
