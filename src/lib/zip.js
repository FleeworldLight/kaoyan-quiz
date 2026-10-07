/**
 * zip.js — 零依赖 ZIP（STORE / 不压缩）读写工具
 * ============================================================================
 * 用途
 *   浏览器端「导出 / 导入包含 WebP 图片的学习数据备份」所需的打包与解包。
 *   一个打包入口、一个解包入口，几十 KB 数据 ~ 几十 MB 图片都能用。
 *
 * 为什么不用 jszip 之类的库
 *   1. 项目依赖要保持精简（React / Radix / Tailwind / ECharts / KaTeX / lucide /
 *      framer-motion），不想为了一个容器格式再塞一个库进来。
 *   2. 要打包的图片是 WebP，本身已经是压缩格式；再 deflate 一遍几乎不减小体积，
 *      只白费 CPU 和时间。所以 ZIP 只用 STORE（compression method = 0，不压缩）。
 *      既然不需要 deflate，也就不需要任何压缩算法实现 —— ZIP 剩下的部分只是一套
 *      「长度 + 偏移 + CRC-32」的容器格式，自己写反而完全可控、可测。
 *
 * API
 *   makeZip(entries) -> Promise<Blob>
 *     entries: Array<{ name: string, data: string | Uint8Array | ArrayBuffer |
 *                              ArrayBufferView | Blob | number[] }>
 *       - name 规范化：反斜杠转正斜杠、去掉开头的 "/"；按 UTF-8 编码写入，并置
 *         general purpose bit 11（UTF-8 标志），因此中文文件名可正常往返。
 *       - string 数据按 UTF-8 编码；Blob 直接读取；其余按二进制字节。
 *     返回 Blob（type = "application/zip"）：可直接 URL.createObjectURL 下载，
 *     或作为 FormData / fetch body 上传。
 *
 *   readZip(input) -> Promise<Array<{ name: string, data: Uint8Array }>>
 *     input: Blob | ArrayBuffer | ArrayBufferView（Uint8Array 等）| Response
 *     以 EOCD -> Central Directory 为准读取（不是只扫 Local Header），逐个
 *     校验 CRC-32；顺序与包内 Central Directory 顺序一致。
 *
 * 用法
 *   import { makeZip, readZip } from './lib/zip.js';
 *
 *   // 导出备份
 *   const blob = await makeZip([
 *     { name: 'state.json',        data: JSON.stringify(state) },
 *     { name: 'images/abc.webp',   data: webpBlob },
 *   ]);
 *   // 下载：URL.createObjectURL(blob) + <a download>
 *
 *   // 导入备份（file 来自 <input type="file"> 或 DataTransfer）
 *   const entries = await readZip(file);
 *   const stateEntry = entries.find((e) => e.name === 'state.json');
 *   const state = JSON.parse(new TextDecoder().decode(stateEntry.data));
 *   for (const e of entries) {
 *     if (e.name.startsWith('images/')) await putImage(e.name, e.data);
 *   }
 *
 * 格式与限制
 *   - 写：Local File Header（含 CRC-32 与大小）+ 数据 + Central Directory + EOCD；
 *     只写 STORE（method = 0），不写 extra field、不写注释、不加密。
 *   - CRC-32 用查表法，表在模块加载时构建一次（不是每次调用重算）。
 *   - 读：method != 0 的条目抛出「不支持压缩方法 N」（deflate=8 未实现）；
 *     CRC-32 不匹配、大小不一致、数据越界、签名错误都会抛出可读错误。
 *   - 32 位字段正确使用；不支持 ZIP64：条目数 > 0xFFFF、单条目/偏移/总大小
 *     >= 0xFFFFFFFF 时抛出明确错误（学习数据备份远达不到这个量级）。
 *   - 只依赖 Web 标准 API（Blob / Uint8Array / DataView / TextEncoder），
 *     不含 document / window，所以 Node 18+ 也能直接 import 做测试。
 *     因为要 await blob.arrayBuffer()，两个入口都是 async 函数。
 */

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_EOCD = 0x06054b50;

const METHOD_STORE = 0;
const FLAG_UTF8 = 0x0800; // general purpose bit 11: filename/comment are UTF-8
const FLAG_ENCRYPTED = 0x0001;

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const ZIP64_SENTINEL = 0xffffffff;

const VERSION_NEEDED = 20; // 2.0: 支持文件夹 + STORE
const VERSION_MADE_BY = 0x031e; // 高字节 3 = Unix，低字节 30 = 3.0
const UNIX_MODE_FILE = 0o100644;
const UNIX_MODE_DIR = 0o40755;

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8');

/** CRC-32 查表：模块加载时构建一次，之后只做查表。 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32（IEEE 802.3，ZIP 使用的多项式 0xEDB88320）。
 * @param {Uint8Array} bytes
 * @param {number} [seed=0] 之前的 CRC 结果，用于分块续算
 * @returns {number} 无符号 32 位整数
 */
export function crc32(bytes, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 打包成 ZIP（STORE，不压缩）。
 * @param {Array<{name: string, data: any}>} entries
 * @param {{ date?: Date }} [options]
 * @returns {Promise<Blob>}
 */
export async function makeZip(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('makeZip(entries): entries 必须是数组');
  }
  if (entries.length > MAX_UINT16) {
    throw new RangeError(
      `makeZip: 条目数 ${entries.length} 超过 65535，需要使用 ZIP64；本工具不支持 ZIP64`
    );
  }

  const { dosTime, dosDate } = toDosDateTime(
    options.date instanceof Date ? options.date : new Date()
  );

  const fileParts = []; // [localHeader, data, localHeader, data, ...]
  const centralRecords = [];
  const seenNames = new Set();
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      throw new TypeError(`makeZip: entries[${i}] 必须是 { name, data } 对象`);
    }

    const name = normalizeEntryName(entry.name, i);
    if (seenNames.has(name)) {
      throw new Error(`makeZip: 条目名重复 "${name}"（ZIP 内条目名必须唯一）`);
    }
    seenNames.add(name);

    const nameBytes = UTF8_ENCODER.encode(name);
    if (nameBytes.length > MAX_UINT16) {
      throw new RangeError(`makeZip: 条目名过长（${nameBytes.length} 字节 > 65535）`);
    }

    const data = await toUint8Array(entry.data, `makeZip: entries[${i}]（"${name}"）的 data`);
    if (data.length > MAX_UINT32) {
      throw new RangeError(
        `makeZip: 条目 "${name}" 数据 ${data.length} 字节超过 0xFFFFFFFF，需要使用 ZIP64；本工具不支持 ZIP64`
      );
    }
    if (offset + 30 + nameBytes.length + data.length > MAX_UINT32) {
      throw new RangeError(
        'makeZip: 打包内容累计超过 0xFFFFFFFF（4 GiB）边界，需要使用 ZIP64；本工具不支持 ZIP64'
      );
    }

    const crc = crc32(data);
    const localHeader = buildLocalFileHeader(nameBytes, crc, data.length, dosTime, dosDate);
    fileParts.push(localHeader, data);
    centralRecords.push({ nameBytes, crc, size: data.length, offset });

    offset += localHeader.length + data.length;
  }

  const centralDirectory = buildCentralDirectory(centralRecords, dosTime, dosDate);
  const cdOffset = offset;
  const cdSize = centralDirectory.length;
  if (cdOffset > MAX_UINT32 || cdSize > MAX_UINT32) {
    throw new RangeError('makeZip: Central Directory 超过 0xFFFFFFFF，需要使用 ZIP64；本工具不支持 ZIP64');
  }

  const eocd = buildEndOfCentralDirectory(centralRecords.length, cdSize, cdOffset);

  return new Blob([...fileParts, centralDirectory, eocd], { type: 'application/zip' });
}

/**
 * 解包 ZIP（只支持 STORE，逐条校验 CRC-32）。
 * @param {Blob|ArrayBuffer|ArrayBufferView|Response} input
 * @returns {Promise<Array<{name: string, data: Uint8Array}>>}
 */
export async function readZip(input) {
  const bytes = await toUint8Array(input, 'readZip 的输入');
  const total = bytes.length;
  if (total < 22) {
    throw new Error('readZip: 数据不足 22 字节，不是有效的 ZIP 文件');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // --- 1. 从尾部搜索 EOCD（注释最长 65535 字节，故最多回看 22 + 65535 字节）
  let eocd = -1;
  const lowest = Math.max(0, total - 22 - MAX_UINT16);
  for (let i = total - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === SIGNATURE_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('readZip: 找不到 End of Central Directory 记录，这可能不是 ZIP 文件');
  }

  const diskNumber = view.getUint16(eocd + 4, true);
  const cdStartDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffsetRaw = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);

  if (diskNumber !== 0 || cdStartDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('readZip: 不支持分卷 ZIP（multi-disk）');
  }
  if (
    entryCount === MAX_UINT16 ||
    cdSize === ZIP64_SENTINEL ||
    cdOffsetRaw === ZIP64_SENTINEL
  ) {
    throw new Error('readZip: 检测到 ZIP64 结构，本工具不支持 ZIP64');
  }
  if (eocd + 22 + commentLength > total) {
    throw new Error('readZip: ZIP 尾注长度异常，文件可能被截断');
  }
  if (cdOffsetRaw + cdSize > eocd) {
    throw new Error('readZip: Central Directory 区间越界，文件可能被截断或损坏');
  }

  // 兼容「前缀数据 + ZIP」（自解压风格）：所有偏移整体平移 base
  const base = eocd - cdSize - cdOffsetRaw;
  const cdOffset = cdOffsetRaw + base;

  // --- 2. 按 Central Directory 逐条解析
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > total) {
      throw new Error(`readZip: Central Directory 第 ${i} 条记录越界，文件可能被截断`);
    }
    if (view.getUint32(p, true) !== SIGNATURE_CENTRAL) {
      throw new Error(`readZip: Central Directory 第 ${i} 条记录签名错误`);
    }

    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const entryCommentLength = view.getUint16(p + 32, true);
    const localOffsetRaw = view.getUint32(p + 42, true);

    const recordEnd = p + 46 + nameLength + extraLength + entryCommentLength;
    if (recordEnd > total) {
      throw new Error(`readZip: Central Directory 第 ${i} 条记录越界，文件可能被截断`);
    }

    // 条目名按 UTF-8 解码（bit 11 未置位时按宽松处理，兼容常见实现）
    const name = UTF8_DECODER.decode(bytes.subarray(p + 46, p + 46 + nameLength));

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localOffsetRaw === ZIP64_SENTINEL
    ) {
      throw new Error(`readZip: 条目 "${name}" 使用了 ZIP64 扩展字段，本工具不支持 ZIP64`);
    }
    if ((flags & FLAG_ENCRYPTED) !== 0) {
      throw new Error(`readZip: 条目 "${name}" 已加密，本工具不支持加密 ZIP`);
    }
    if (method !== METHOD_STORE) {
      throw new Error(
        `readZip: 条目 "${name}" 使用了不支持的压缩方法 ${method}（本工具只支持 STORE/0；deflate=8 未实现）`
      );
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(
        `readZip: 条目 "${name}" 声明的压缩大小(${compressedSize})与原始大小(${uncompressedSize})不一致（STORE 条目两者必须相等）`
      );
    }

    // --- 3. 定位 Local File Header 取数据（大小/CRC 以 Central Directory 为准）
    const local = localOffsetRaw + base;
    if (local + 30 > total) {
      throw new Error(`readZip: 条目 "${name}" 的 Local File Header 越界，文件可能被截断`);
    }
    if (view.getUint32(local, true) !== SIGNATURE_LOCAL) {
      throw new Error(`readZip: 条目 "${name}" 的 Local File Header 签名错误`);
    }
    if (view.getUint16(local + 8, true) !== method) {
      throw new Error(`readZip: 条目 "${name}" 的 Local/Central 压缩方法不一致`);
    }
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > total) {
      throw new Error(`readZip: 条目 "${name}" 的数据越界，文件可能被截断`);
    }

    const data = bytes.slice(dataStart, dataEnd);
    const actualCrc = crc32(data);
    if (actualCrc !== crc) {
      throw new Error(
        `readZip: 条目 "${name}" CRC-32 校验失败（记录值 0x${hex32(crc)}，实际 0x${hex32(actualCrc)}），数据已损坏`
      );
    }

    entries.push({ name, data });
    p = recordEnd;
  }

  return entries;
}

/* ------------------------------------------------------------------ 内部工具 */

function hex32(n) {
  return (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function normalizeEntryName(name, index) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(`makeZip: entries[${index}].name 必须是非空字符串`);
  }
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.length === 0) {
    throw new TypeError(`makeZip: entries[${index}].name 规范化后为空（"${name}"）`);
  }
  return normalized;
}

async function toUint8Array(value, label = 'data') {
  if (value === null || value === undefined) {
    throw new TypeError(`${label} 不能是 null/undefined`);
  }
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return UTF8_ENCODER.encode(value);
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof Response !== 'undefined' && value instanceof Response) {
    return new Uint8Array(await value.arrayBuffer());
  }
  throw new TypeError(
    `${label} 类型不支持：${Object.prototype.toString.call(value)}（可用 string/Uint8Array/ArrayBuffer/Blob）`
  );
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime: dosTime & 0xffff, dosDate: dosDate & 0xffff };
}

function buildLocalFileHeader(nameBytes, crc, size, dosTime, dosDate) {
  const buf = new Uint8Array(30 + nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, SIGNATURE_LOCAL, true);
  dv.setUint16(4, VERSION_NEEDED, true);
  dv.setUint16(6, FLAG_UTF8, true); // bit 11: UTF-8 文件名
  dv.setUint16(8, METHOD_STORE, true);
  dv.setUint16(10, dosTime, true);
  dv.setUint16(12, dosDate, true);
  dv.setUint32(14, crc >>> 0, true);
  dv.setUint32(18, size >>> 0, true); // compressed size（STORE 下等于原始大小）
  dv.setUint32(22, size >>> 0, true); // uncompressed size
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true); // extra field length
  buf.set(nameBytes, 30);
  return buf;
}

function buildCentralDirectory(records, dosTime, dosDate) {
  let size = 0;
  for (const r of records) size += 46 + r.nameBytes.length;

  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  let p = 0;

  for (const r of records) {
    const isDir = r.nameBytes.length > 0 && r.nameBytes[r.nameBytes.length - 1] === 0x2f; // "/"
    dv.setUint32(p, SIGNATURE_CENTRAL, true);
    dv.setUint16(p + 4, VERSION_MADE_BY, true);
    dv.setUint16(p + 6, VERSION_NEEDED, true);
    dv.setUint16(p + 8, FLAG_UTF8, true);
    dv.setUint16(p + 10, METHOD_STORE, true);
    dv.setUint16(p + 12, dosTime, true);
    dv.setUint16(p + 14, dosDate, true);
    dv.setUint32(p + 16, r.crc >>> 0, true);
    dv.setUint32(p + 20, r.size >>> 0, true);
    dv.setUint32(p + 24, r.size >>> 0, true);
    dv.setUint16(p + 28, r.nameBytes.length, true);
    dv.setUint16(p + 30, 0, true); // extra field length
    dv.setUint16(p + 32, 0, true); // file comment length
    dv.setUint16(p + 34, 0, true); // disk number start
    dv.setUint16(p + 36, 0, true); // internal file attributes
    dv.setUint32(p + 38, ((isDir ? UNIX_MODE_DIR : UNIX_MODE_FILE) << 16) >>> 0, true);
    dv.setUint32(p + 42, r.offset >>> 0, true);
    buf.set(r.nameBytes, p + 46);
    p += 46 + r.nameBytes.length;
  }

  return buf;
}

function buildEndOfCentralDirectory(entryCount, cdSize, cdOffset) {
  const buf = new Uint8Array(22);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, SIGNATURE_EOCD, true);
  dv.setUint16(4, 0, true); // 当前磁盘号
  dv.setUint16(6, 0, true); // Central Directory 起始磁盘号
  dv.setUint16(8, entryCount, true); // 本盘条目数
  dv.setUint16(10, entryCount, true); // 总条目数
  dv.setUint32(12, cdSize >>> 0, true);
  dv.setUint32(16, cdOffset >>> 0, true);
  dv.setUint16(20, 0, true); // 注释长度
  return buf;
}
