'use strict';

/**
 * 待测试脚本列表（单一来源）。
 * run-tests.js（Node 测试）、es2026-check.js、quickjs-check.js 共用，
 * 避免脚本列表在多处重复维护导致不同步。
 */
const SCRIPTS = [
  {
    file: 'Script/mihomoScript.js',
    label: 'mihomoScript.js',
  },
];

/** 脚本文件路径列表（供兼容性检查模块使用） */
const SCRIPT_FILES = SCRIPTS.map((s) => s.file);

module.exports = { SCRIPTS, SCRIPT_FILES };
