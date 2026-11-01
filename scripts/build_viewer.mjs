// Copy pinned local assets using Node APIs; no shell-specific cp or external CDN is required.
// 使用 Node API 复制固定版本的本地资源；不依赖 shell 专有 cp 或外部 CDN。
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

// Require resolves packages beside the runtime package manifest on all supported platforms.
// Require 在所有受支持平台上从运行时包清单旁解析依赖。
const require=createRequire(new URL('../node/package.json',import.meta.url));
// Asset is the exact upstream Dagre 0.8.5 browser bundle.
// Asset 是精确的上游 Dagre 0.8.5 浏览器包。
const asset=require.resolve('dagre/dist/dagre.min.js');
fs.copyFileSync(asset,new URL('../resources/dagre.min.js',import.meta.url));
fs.copyFileSync(require.resolve('dagre/LICENSE'),new URL('../licenses/dagre-MIT.txt',import.meta.url));
fs.copyFileSync(path.join(path.dirname(require.resolve('yaml/package.json')),'LICENSE'),new URL('../licenses/yaml-ISC.txt',import.meta.url));
// DagreRequire resolves the two packages bundled into the upstream browser distribution.
// DagreRequire 解析上游浏览器分发包内嵌的两个依赖。
const dagreRequire=createRequire(require.resolve('dagre/package.json'));
fs.copyFileSync(dagreRequire.resolve('graphlib/LICENSE'),new URL('../licenses/graphlib-MIT.txt',import.meta.url));
fs.copyFileSync(dagreRequire.resolve('lodash/LICENSE'),new URL('../licenses/lodash-MIT.txt',import.meta.url));
console.log('Offline viewer assets ready (Dagre 0.8.5).');
