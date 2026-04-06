/**
 * Genesis 环境沙箱 — 白名单环境变量过滤。
 *
 * 设计原则：
 *   - 默认拒绝：只允许白名单内和指定前缀的 env var
 *   - 最小权限：Genesis 进程不需要主进程的 API 密钥、数据库 URL 等
 *   - 可扩展：通过 GENESIS_ALLOWED_ENV_PREFIXES 自定义
 */

import os from "node:os";
import path from "node:path";

/**
 * 默认允许的环境变量前缀/名称（精确匹配或前缀匹配）
 */
const DEFAULT_ALLOWED_PATTERNS = [
  // OpenClaw Genesis 自身需要的
  "OPENCLAW_GENESIS_",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_CONFIG_PATH",
  // 运行时基础
  "PATH",
  "HOME",
  "NODE_",
  "LANG",
  "LC_",
  // 系统需要的
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
];

/**
 * 判断 key 是否匹配某个 pattern（精确匹配或前缀匹配）
 */
function matchesPattern(key, pattern) {
  if (key === pattern) return true;
  if (pattern.endsWith("_") && key.startsWith(pattern)) return true;
  return false;
}

/**
 * 构建沙箱化的环境变量对象。
 *
 * @param {object} sourceEnv - 源环境变量（通常是 process.env）
 * @param {object} overrides - 必须注入的变量（即使不在白名单中）
 * @param {string[]} [extraPatterns] - 额外允许的模式
 * @returns {object} 过滤后的环境变量
 */
export function buildSandboxEnv(sourceEnv, overrides = {}, extraPatterns = []) {
  const allowedPatterns = [
    ...DEFAULT_ALLOWED_PATTERNS,
    // 支持用户通过环境变量扩展白名单
    ...parseExtraPrefixes(process.env.GENESIS_ALLOWED_ENV_PREFIXES),
    ...extraPatterns,
  ];

  // 去重
  const unique = [...new Set(allowedPatterns)];

  const clean = {};
  for (const key of Object.keys(sourceEnv)) {
    const allowed = unique.some((p) => matchesPattern(key, p));
    if (!allowed) continue;
    // 过滤掉空值
    if (sourceEnv[key] == null) continue;
    clean[key] = sourceEnv[key];
  }

  // 注入 overrides（不受白名单限制）
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      clean[key] = value;
    }
  }

  return clean;
}

/**
 * 构建 Genesis 目标路径（支持环境变量 + 合理默认值）
 */
export function resolveGenesisPaths() {
  const stateDir =
    process.env.OPENCLAW_GENESIS_STATE_DIR ||
    process.env.OPENCLAW_STATE_DIR ||
    path.join(os.homedir(), ".openclaw-genesis");

  const configPath =
    process.env.OPENCLAW_CONFIG_PATH ||
    path.join(
      process.env.OPENCLAW_STATE_DIR ||
        process.env.OPENCLAW_GENESIS_STATE_DIR ||
        os.homedir(),
      "openclaw.json",
    );

  const scriptDir =
    process.env.OPENCLAW_GENESIS_SCRIPT_DIR || "/opt/openclaw-genesis";

  return { stateDir, configPath, scriptDir };
}

/**
 * 构建 Genesis 专用的环境变量（含隔离的 HOME 和 STATE_DIR）
 */
export function buildGenesisEnv(sourceEnv = process.env) {
  const { stateDir, configPath } = resolveGenesisPaths();
  return buildSandboxEnv(sourceEnv, {
    HOME: stateDir,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_GENESIS_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED: "1",
  });
}

/**
 * 解析 GENESIS_ALLOWED_ENV_PREFIXES（逗号分隔）
 */
function parseExtraPrefixes(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * 资源限制配置
 */
export const DEFAULT_RESOURCE_LIMITS = Object.freeze({
  /** stdout/stderr 最大缓冲（字节） */
  maxBufferBytes: 1024 * 1024,
  /** 子进程超时（毫秒） */
  timeoutMs: 180_000,
  /** 建议的 CPU 限额（仅在 Linux 上通过 cpulimit 可用） */
  cpuLimitPercent: 80,
  /** 建议的最大内存（字节），超出时会被 SIGKILL */
  maxMemoryBytes: 512 * 1024 * 1024,
});
