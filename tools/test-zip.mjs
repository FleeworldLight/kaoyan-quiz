#!/usr/bin/env node
/**
 * tools/test-zip.mjs — src/lib/zip.js 的往返（round-trip）验证脚本
 *
 * 运行：node tools/test-zip.mjs
 *
 * 覆盖：
 *   1. 自产自销：makeZip → readZip 逐字节比对（中文名 / 空文件 / 1 字节 / 2MB 随机 /
 *      0 字节 Blob / 目录项 / Blob 输入），并直接检查 Local Header 里的
 *      method=0 与 general purpose bit 11（UTF-8 标志）
 *   2. 我们打包 → Python 标准库 zipfile 解包（外部实现，证明格式真的标准）：
 *      testzip()、read() 逐字节 + sha256、namelist()（含中文名）
 *   3. Python 打包（ZIP_STORED）→ 我们解包；另加 deflate 包必须被明确拒绝
 *   4. 真实场景大小：30 个各 400KB 的假 WebP 一起打包 / 解包 + 耗时
 *   5. 边界与负例：CRC-32 已知向量、CRC 损坏检测、截断文件、非 ZIP 输入、
 *      文件名规范化、重名报错
 *
 * 任一项失败 → process.exit(1)。
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crc32, makeZip, readZip } from '../src/lib/zip.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache', 'zip-test');
const PYTHON =
  'C:\\Users\\20396\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const PY_HELPER = path.join(CACHE, 'zip_py_helper.py');

const TE = new TextEncoder();

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${'='.repeat(78)}\n== ${title}\n${'='.repeat(78)}`);
}
function ok(label, extra = '') {
  passed++;
  console.log(`  \u2713 ${label}${extra ? `  ${extra}` : ''}`);
}
function bad(label, detail = '') {
  failed++;
  console.log(`  \u2717 ${label}${detail ? `\n      ${detail}` : ''}`);
}
function check(label, condition, detail = '') {
  if (condition) ok(label, detail);
  else bad(label, detail);
  return condition;
}
function info(msg) {
  console.log(`  · ${msg}`);
}

/* ---------------------------------------------------------------- 小工具 */

function random(n) {
  return new Uint8Array(nodeRandomBytes(n));
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function eqBytes(a, b) {
  if (a.length !== b.length) return `长度不同：${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return `第 ${i} 字节不同：0x${a[i].toString(16)} vs 0x${b[i].toString(16)}`;
  }
  return null;
}
async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
/** 假 WebP：RIFF 头 + 确定性伪随机体 */
function fakeWebp(size, seed) {
  const buf = new Uint8Array(size);
  buf.set(TE.encode('RIFF').subarray(0, Math.min(4, size)), 0);
  let x = (seed | 1) >>> 0;
  for (let i = 4; i < size; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    buf[i] = (x >>> 16) & 0xff;
  }
  return buf;
}
function fmtMs(ms) {
  return `${ms.toFixed(1)} ms`;
}
function fmtSize(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

/* ------------------------------------------------------- 样本数据（共用） */

/**
 * @returns {Array<{name: string, data: any, bytes: Uint8Array, what: string}>}
 */
function buildSamples() {
  const stateJson = JSON.stringify(
    {
      app: 'kaoyan-quiz',
      导出时间: '2026-01-01 12:00',
      说明: '包含中文、emoji 🎯 与换行\n第二行',
      answers: { '数学-2024-1': 'A', '英语-2024-2': 'B' },
    },
    null,
    2
  );
  const textBytes = TE.encode(stateJson);
  const big = random(2 * 1024 * 1024);
  const blobBin = random(4096);
  const cjkBin = fakeWebp(64 * 1024, 7);

  return [
    {
      name: 'state.json',
      data: stateJson,
      bytes: textBytes,
      what: 'UTF-8 中文字符串（自动编码）',
    },
    {
      name: '图片/考研 笔记.webp',
      data: cjkBin,
      bytes: cjkBin,
      what: '中文 + 空格 + 子目录的 WebP（64KB）',
    },
    { name: 'empty.bin', data: new Uint8Array(0), bytes: new Uint8Array(0), what: '0 字节 Uint8Array' },
    { name: 'one.bin', data: Uint8Array.of(0x42), bytes: Uint8Array.of(0x42), what: '1 字节' },
    { name: 'random-2mb.bin', data: big, bytes: big, what: '约 2MB 随机二进制' },
    {
      name: 'images/blob-empty.webp',
      data: new Blob([]),
      bytes: new Uint8Array(0),
      what: '0 字节 Blob',
    },
    {
      name: 'images/blob-4kb.webp',
      data: new Blob([blobBin]),
      bytes: blobBin,
      what: 'Blob（4KB 二进制）',
    },
    { name: 'images/', data: new Uint8Array(0), bytes: new Uint8Array(0), what: '目录项' },
  ];
}

/* ------------------------------------------------------ Python 辅助脚本生成 */

const PY_HELPER_SOURCE = `# -*- coding: utf-8 -*-
"""由 tools/test-zip.mjs 生成：src/lib/zip.js 的 Python 侧互操作校验/打包辅助脚本。"""
import hashlib
import json
import os
import sys
import zipfile

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def cmd_verify(zip_path, manifest_path):
    with open(manifest_path, 'r', encoding='utf-8') as fh:
        man = json.load(fh)
    base = os.path.dirname(os.path.abspath(manifest_path))
    print('python %s / zipfile %s' % (sys.version.split()[0], zipfile.__name__))
    zf = zipfile.ZipFile(zip_path)
    names = zf.namelist()
    print('python: namelist() -> %d 条: %s' % (len(names), json.dumps(names, ensure_ascii=False)))
    bad = zf.testzip()
    if bad is not None:
        print('python: FAIL testzip() -> %r' % bad)
        return 1
    print('python: testzip() -> None  (所有条目 CRC-32 与数据一致)')
    if names != man['names']:
        print('python: FAIL namelist 不一致')
        print('  got     :', json.dumps(names, ensure_ascii=False))
        print('  expected:', json.dumps(man['names'], ensure_ascii=False))
        return 1
    cjk = [n for n in names if any(ord(ch) > 127 for ch in n)]
    print('python: namelist() 与预期完全一致；中文条目 %d 个 %s' % (len(cjk), json.dumps(cjk, ensure_ascii=False)))
    for item in man['files']:
        with open(os.path.join(base, item['path']), 'rb') as fh:
            raw = fh.read()
        got = zf.read(item['name'])
        info = zf.getinfo(item['name'])
        if got != raw:
            print('python: FAIL 内容不一致 %s' % item['name'])
            return 1
        if hashlib.sha256(got).hexdigest() != item['sha256']:
            print('python: FAIL sha256 不一致 %s' % item['name'])
            return 1
        if info.compress_type != zipfile.ZIP_STORED:
            print('python: FAIL compress_type=%d 不是 ZIP_STORED' % info.compress_type)
            return 1
        if any(ord(ch) > 127 for ch in item['name']) and not (info.flag_bits & 0x800):
            print('python: FAIL 非 ASCII 文件名未置 UTF-8 标志位 (bit 11): %s' % item['name'])
            return 1
        print('  OK %-32s %9d bytes  method=STORE  crc=0x%08X  sha256=%s..' % (
            item['name'], info.file_size, info.CRC, hashlib.sha256(got).hexdigest()[:16]))
    print('PYTHON-VERIFY-OK')
    return 0


def _write(src_dir, out_path, compress_type):
    with open(os.path.join(src_dir, 'manifest.json'), 'r', encoding='utf-8') as fh:
        items = json.load(fh)
    with zipfile.ZipFile(out_path, 'w', compress_type) as zf:
        for it in items:
            with open(os.path.join(src_dir, it['path']), 'rb') as fh:
                data = fh.read()
            zi = zipfile.ZipInfo(it['name'], date_time=(2024, 1, 2, 3, 4, 6))
            zi.compress_type = compress_type
            zi.external_attr = 0o100644 << 16
            zf.writestr(zi, data)
            print('python: wrote %-32s %9d bytes  method=%d' % (it['name'], len(data), compress_type))
    print('PYTHON-MAKE-OK (%s, compress_type=%d)' % (out_path, compress_type))
    return 0


def cmd_make(src_dir, out_path):
    return _write(src_dir, out_path, zipfile.ZIP_STORED)


def cmd_make_deflated(src_dir, out_path):
    return _write(src_dir, out_path, zipfile.ZIP_DEFLATED)


def main():
    mode = sys.argv[1]
    if mode == 'verify':
        return cmd_verify(sys.argv[2], sys.argv[3])
    if mode == 'make':
        return cmd_make(sys.argv[2], sys.argv[3])
    if mode == 'make-deflated':
        return cmd_make_deflated(sys.argv[2], sys.argv[3])
    print('unknown mode: %s' % mode)
    return 2


if __name__ == '__main__':
    sys.exit(main())
`;

function runPython(args, label) {
  const res = spawnSync(PYTHON, [PY_HELPER, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  if (res.error) {
    bad(`${label}：无法启动 Python（${PYTHON}）`, String(res.error.message));
    return null;
  }
  for (const line of String(res.stdout || '').split(/\r?\n/)) {
    if (line.length) console.log(`    ${line}`);
  }
  if (res.stderr) {
    for (const line of String(res.stderr).split(/\r?\n/)) {
      if (line.length) console.log(`    [stderr] ${line}`);
    }
  }
  return res;
}

/* ------------------------------------------------------------------ 各项测试 */

async function test1SelfRoundTrip() {
  section('1. 自产自销往返：makeZip → readZip（逐字节比对）');

  const samples = buildSamples();
  const blob = await makeZip(samples.map(({ name, data }) => ({ name, data })));
  const zipBytes = await blobBytes(blob);

  info(`Blob.type = ${blob.type}，zip 大小 = ${zipBytes.length} 字节（${fmtSize(zipBytes.length)}）`);
  info(`条目 = ${samples.length} 个，合计原始数据 ${fmtSize(samples.reduce((n, s) => n + s.bytes.length, 0))}`);

  // --- 直接检查我们写出来的容器字段
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  check('第 1 个 Local File Header 签名 = 0x04034b50', dv.getUint32(0, true) === 0x04034b50);
  check('压缩方法 = 0（STORE，不压缩）', dv.getUint16(8, true) === 0, `method=${dv.getUint16(8, true)}`);
  check(
    'general purpose bit 11（UTF-8 文件名标志）已置位',
    (dv.getUint16(6, true) & 0x0800) !== 0,
    `flags=0x${dv.getUint16(6, true).toString(16).padStart(4, '0')}`
  );
  check('Local 与 Central 的 CRC-32 一致', (() => {
    const lfhCrc = dv.getUint32(14, true);
    const cdOffset = dv.getUint32(zipBytes.length - 22 + 16, true);
    return dv.getUint32(cdOffset + 16, true) === lfhCrc;
  })());
  check(
    'EOCD 记录的总条目数正确',
    dv.getUint16(zipBytes.length - 22 + 10, true) === samples.length,
    `EOCD total=${dv.getUint16(zipBytes.length - 22 + 10, true)} / 期望 ${samples.length}`
  );

  // --- readZip 三种输入形态都要能解
  const fromBlob = await readZip(blob);
  const fromArrayBuffer = await readZip(zipBytes.buffer.slice(0));
  const padded = new Uint8Array(zipBytes.length + 8);
  padded.set(zipBytes, 4);
  const fromSubarray = await readZip(padded.subarray(4, 4 + zipBytes.length)); // byteOffset != 0

  check('readZip(Blob) 条目数一致', fromBlob.length === samples.length, `${fromBlob.length}`);
  check('readZip(ArrayBuffer) 条目数一致', fromArrayBuffer.length === samples.length);
  check('readZip(Uint8Array 子视图，byteOffset≠0) 条目数一致', fromSubarray.length === samples.length);

  const names = fromBlob.map((e) => e.name);
  const expectNames = samples.map((s) => s.name);
  check(
    '条目名（含中文 / 子目录 / 目录项）完全一致',
    JSON.stringify(names) === JSON.stringify(expectNames),
    JSON.stringify(names)
  );

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const got = fromBlob[i];
    const diff = eqBytes(got.data, s.bytes);
    check(
      `逐字节相同：${s.name}`,
      diff === null,
      diff ? `${s.what} → ${diff}` : `${s.what}，${s.bytes.length} 字节`
    );
  }
  for (const s of samples) {
    const gotArrayBuffer = fromArrayBuffer.find((e) => e.name === s.name);
    const gotSub = fromSubarray.find((e) => e.name === s.name);
    if (!check(`ArrayBuffer / 子视图输入内容一致：${s.name}`, !!gotArrayBuffer && !!gotSub)) continue;
    const d1 = eqBytes(gotArrayBuffer.data, s.bytes);
    const d2 = eqBytes(gotSub.data, s.bytes);
    check(`  ArrayBuffer 输入逐字节相同：${s.name}`, d1 === null, d1 || '');
    check(`  子视图输入逐字节相同：${s.name}`, d2 === null, d2 || '');
  }

  // --- 数据独立性：解出来的数组必须是独立拷贝，而不是指向 zip 缓冲区的视图
  const stateEntry = fromBlob.find((e) => e.name === 'state.json');
  const stateDataOffset = 30 + dv.getUint16(26, true); // state.json 是第 1 个条目
  const zipByteBefore = zipBytes[stateDataOffset];
  const dataByteBefore = stateEntry.data[0];
  stateEntry.data[0] = dataByteBefore ^ 0xff;
  check(
    '解出的 data 是独立拷贝（改写它不会污染 zip 原始缓冲区）',
    stateEntry.data.buffer !== zipBytes.buffer &&
      stateEntry.data.buffer !== padded.buffer &&
      zipBytes[stateDataOffset] === zipByteBefore,
    `data.buffer=${stateEntry.data.buffer.byteLength} 字节，zip 中同位置字节 0x${zipBytes[stateDataOffset].toString(16)}`
  );
  stateEntry.data[0] = dataByteBefore;
}

async function test2OursToPython() {
  section('2. 我们打包 → Python 标准库 zipfile 解包（外部实现互操作）');

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(PY_HELPER, PY_HELPER_SOURCE, 'utf8');

  const samples = buildSamples();
  const blob = await makeZip(
    samples.map(({ name, data }) => ({ name, data })),
    { date: new Date(2026, 0, 1, 12, 0, 0) }
  );
  const zipPath = path.join(CACHE, 'out.zip');
  fs.writeFileSync(zipPath, Buffer.from(await blob.arrayBuffer()));
  info(`已写入 ${zipPath}（${fmtSize(fs.statSync(zipPath).size)}）`);

  const expectedDir = path.join(CACHE, 'expected');
  fs.rmSync(expectedDir, { recursive: true, force: true });
  fs.mkdirSync(expectedDir, { recursive: true });

  const manifest = { names: [], files: [] };
  samples.forEach((s, i) => {
    const rel = `expected/${String(i).padStart(2, '0')}.bin`;
    fs.writeFileSync(path.join(CACHE, rel), Buffer.from(s.bytes));
    manifest.names.push(s.name);
    manifest.files.push({ name: s.name, path: rel, size: s.bytes.length, sha256: sha256(s.bytes) });
  });
  const manifestPath = path.join(CACHE, 'expect-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('  --- Python 侧输出 ---');
  const res = runPython(['verify', zipPath, manifestPath], 'Python 校验');
  check('Python zipfile 校验通过（testzip + read + namelist）', !!res && res.status === 0, res ? `exit=${res.status}` : 'python 未运行');
  check('Python 输出中出现 PYTHON-VERIFY-OK', !!res && String(res.stdout).includes('PYTHON-VERIFY-OK'));
}

async function test3PythonToOurs() {
  section('3. Python 打包（ZIP_STORED）→ 我们解包（逐字节比对）');

  const srcDir = path.join(CACHE, 'py-src');
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.mkdirSync(srcDir, { recursive: true });

  const items = [
    { name: '状态.json', bytes: TE.encode(JSON.stringify({ 来源: 'python', 值: [1, 2, 3] })) },
    { name: '图片/截图 01.webp', bytes: fakeWebp(300 * 1024, 21) },
    { name: 'empty.bin', bytes: new Uint8Array(0) },
    { name: 'one.bin', bytes: Uint8Array.of(0x99) },
    { name: 'deep/nested/中文 目录/数据.bin', bytes: random(12345) },
  ];
  const pyManifest = [];
  items.forEach((it, i) => {
    const rel = `f${String(i).padStart(2, '0')}.bin`;
    fs.writeFileSync(path.join(srcDir, rel), Buffer.from(it.bytes));
    pyManifest.push({ name: it.name, path: rel });
  });
  fs.writeFileSync(path.join(srcDir, 'manifest.json'), JSON.stringify(pyManifest, null, 2), 'utf8');

  const pyZip = path.join(CACHE, 'py-made.zip');
  console.log('  --- Python 侧输出（打包 STORED） ---');
  const resMake = runPython(['make', srcDir, pyZip], 'Python 打包');
  const madeOk = check('Python 生成 ZIP 成功', !!resMake && resMake.status === 0 && String(resMake.stdout).includes('PYTHON-MAKE-OK'));

  if (madeOk) {
    const entries = await readZip(fs.readFileSync(pyZip)); // Buffer → Uint8Array
    check('我们解出的条目数正确', entries.length === items.length, `${entries.length} vs ${items.length}`);
    check(
      '我们解出的条目名（含中文 / 嵌套中文目录）正确',
      JSON.stringify(entries.map((e) => e.name)) === JSON.stringify(items.map((i) => i.name)),
      JSON.stringify(entries.map((e) => e.name))
    );
    for (const it of items) {
      const got = entries.find((e) => e.name === it.name);
      const diff = got ? eqBytes(got.data, it.bytes) : '条目缺失';
      check(`Python 打包 → 我们逐字节相同：${it.name}`, diff === null, diff || `${it.bytes.length} 字节`);
    }
  } else {
    bad('跳过：Python 未生成 ZIP');
  }

  // --- 负例：deflate 包必须被明确拒绝
  const pyDeflated = path.join(CACHE, 'py-deflated.zip');
  console.log('  --- Python 侧输出（打包 DEFLATED，作为负例） ---');
  const resDeflate = runPython(['make-deflated', srcDir, pyDeflated], 'Python 打包(deflate)');
  if (check('Python 生成 deflate ZIP 成功', !!resDeflate && resDeflate.status === 0)) {
    let err = null;
    try {
      await readZip(fs.readFileSync(pyDeflated));
    } catch (e) {
      err = e;
    }
    check(
      'deflate 条目被明确拒绝（提示「不支持的压缩方法」）',
      !!err && /不支持的压缩方法/.test(err.message),
      err ? err.message : '竟然解包成功了'
    );
  }
}

async function test4RealisticSize() {
  section('4. 真实场景大小：30 × 400KB 假 WebP 一起打包 / 解包');

  const COUNT = 30;
  const SIZE = 400 * 1024;
  const items = [];
  for (let i = 0; i < COUNT; i++) {
    items.push({
      name: `images/q-${String(i).padStart(2, '0')}-题干 图.webp`,
      data: fakeWebp(SIZE, i * 7 + 3),
    });
  }
  const rawTotal = COUNT * SIZE;
  info(`原始数据 ${COUNT} × 400KB = ${fmtSize(rawTotal)}`);

  const t0 = performance.now();
  const blob = await makeZip(items);
  const t1 = performance.now();
  const zipBytes = await blobBytes(blob);
  const t2 = performance.now();
  const entries = await readZip(blob);
  const t3 = performance.now();

  check('条目数正确', entries.length === COUNT, `${entries.length}/${COUNT}`);
  check('zip 体积 = 原始数据 + 头部开销（STORE 不压缩）', zipBytes.length >= rawTotal && zipBytes.length < rawTotal + 16 * 1024, `${fmtSize(zipBytes.length)}`);
  let mismatched = 0;
  let firstBad = '';
  for (let i = 0; i < COUNT; i++) {
    const e = entries[i];
    if (e.name !== items[i].name) {
      mismatched++;
      if (!firstBad) firstBad = `名字：${e.name} != ${items[i].name}`;
      continue;
    }
    const diff = eqBytes(e.data, items[i].data);
    if (diff) {
      mismatched++;
      if (!firstBad) firstBad = `${e.name}：${diff}`;
    }
  }
  check(`30 个条目全部逐字节相同`, mismatched === 0, firstBad);
  info(`makeZip ${fmtMs(t1 - t0)}（${fmtSize(rawTotal / ((t1 - t0) / 1000))}/s）`);
  info(`Blob→Uint8Array ${fmtMs(t2 - t1)}`);
  info(`readZip（含 30 次 CRC-32 校验）${fmtMs(t3 - t2)}，zip 大小 ${fmtSize(zipBytes.length)}`);
}

async function test5EdgeCases() {
  section('5. 边界与负例');

  // --- CRC-32 已知向量（IEEE 802.3 标准测试串）
  const vector = crc32(TE.encode('123456789'));
  check('CRC-32("123456789") = 0xCBF43926（标准测试向量）', vector === 0xcbf43926, `得到 0x${vector.toString(16).toUpperCase()}`);
  const chunked = crc32(TE.encode('6789'), crc32(TE.encode('12345')));
  check('CRC-32 支持分块续算（seed 参数）', chunked === vector, `0x${chunked.toString(16).toUpperCase()}`);

  // --- CRC 损坏检测
  const payload = random(64);
  const goodZip = await blobBytes(await makeZip([{ name: 'a.bin', data: payload }]));
  const localNameLen = new DataView(goodZip.buffer, goodZip.byteOffset, goodZip.byteLength).getUint16(26, true);
  const corrupt = goodZip.slice();
  corrupt[30 + localNameLen + 10] ^= 0xff; // 翻掉数据区一个 bit
  let crcErr = null;
  try {
    await readZip(corrupt);
  } catch (e) {
    crcErr = e;
  }
  check(
    'CRC-32 损坏的数据被检测并报错',
    !!crcErr && /CRC-32/.test(crcErr.message),
    crcErr ? crcErr.message : '竟然没报错'
  );

  // --- 截断 / 非 ZIP
  let truncErr = null;
  try {
    await readZip(goodZip.subarray(0, goodZip.length - 12));
  } catch (e) {
    truncErr = e;
  }
  check('截断的 ZIP 被拒绝', !!truncErr, truncErr ? truncErr.message : '没报错');

  let nonZipErr = null;
  try {
    await readZip(TE.encode('这不是一个 zip 文件，只是一段普通文本内容，用来测试错误提示。'.repeat(4)));
  } catch (e) {
    nonZipErr = e;
  }
  check('非 ZIP 输入被拒绝（提示找不到 EOCD）', !!nonZipErr && /Central Directory/.test(nonZipErr.message), nonZipErr ? nonZipErr.message : '没报错');

  // --- 文件名规范化
  const norm = await readZip(await makeZip([{ name: '\\图片\\反斜杠.webp', data: Uint8Array.of(1) }]));
  check('反斜杠 / 开头斜杠会被规范化', norm[0].name === '图片/反斜杠.webp', norm[0].name);

  // --- 重名报错
  let dupErr = null;
  try {
    await makeZip([
      { name: 'same.txt', data: 'a' },
      { name: './same.txt'.replace('./', ''), data: 'b' },
    ]);
  } catch (e) {
    dupErr = e;
  }
  check('重名条目被拒绝', !!dupErr && /重复/.test(dupErr.message), dupErr ? dupErr.message : '没报错');

  // --- 空包（合法 ZIP）
  const emptyZip = await readZip(await makeZip([]));
  check('空 ZIP（0 条目）可正常往返', Array.isArray(emptyZip) && emptyZip.length === 0);

  // --- 不支持的输入类型
  let typeErr = null;
  try {
    await makeZip([{ name: 'x.bin', data: 12345 }]);
  } catch (e) {
    typeErr = e;
  }
  check('非法 data 类型给出明确错误', !!typeErr && /类型不支持/.test(typeErr.message), typeErr ? typeErr.message : '没报错');
}

/* ------------------------------------------------------------------ 入口 */

async function main() {
  console.log('ZIP 往返验证  src/lib/zip.js');
  console.log(`node ${process.version}  (全局 Blob: ${typeof Blob})`);
  console.log(`python: ${PYTHON}`);

  const t0 = performance.now();
  await test1SelfRoundTrip();
  await test2OursToPython();
  await test3PythonToOurs();
  await test4RealisticSize();
  await test5EdgeCases();
  const total = performance.now() - t0;

  section('汇总');
  console.log(`  通过 ${passed} 项，失败 ${failed} 项，总耗时 ${fmtMs(total)}`);
  console.log(`  产物：${path.join(CACHE, 'out.zip')} / py-made.zip / py-deflated.zip`);
  if (failed > 0) {
    console.log('\n结果：失败 ✗');
    process.exit(1);
  }
  console.log('\n结果：全部通过 ✓');
}

main().catch((err) => {
  console.error('\n未捕获异常：', err);
  process.exit(1);
});
