'use strict';

/**
 * 待测试脚本及其地区元信息（单一来源）。
 * run-tests.js（Node 测试）、es2026-check.js、quickjs-check.js 共用，
 * 避免脚本列表在多处重复维护导致不同步。
 */
const SCRIPTS = [
  {
    file: 'Script/mihomoScript.js',
    label: 'mihomoScript.js',
    meta: {
      regions: [
        '香港',
        '日本',
        '美国',
        '新加坡',
        '台湾',
        '韩国',
        '澳大利亚',
        '印度',
        '加拿大',
        '德国',
        '英国',
        '法国',
        '荷兰',
        '西班牙',
        '俄罗斯',
        '乌克兰',
        '土耳其',
        '挪威',
        '瑞士',
        '瑞典',
        '爱尔兰',
        '菲律宾',
        '印度尼西亚',
        '越南',
        '泰国',
        '马来西亚',
      ],
    },
  },
];

/** 脚本文件路径列表（供兼容性检查模块使用） */
const SCRIPT_FILES = SCRIPTS.map((s) => s.file);

module.exports = { SCRIPTS, SCRIPT_FILES };
