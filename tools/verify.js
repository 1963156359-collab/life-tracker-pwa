/* =========================================================================
   自动验证脚本（开发者工具） 用法：node tools/verify.js
   -------------------------------------------------------------------------
   覆盖检查：
   1) index.html 内联脚本 与 sw.js 语法检查；
   2) manifest.json 合法性、图标文件存在；
   3) 核心业务逻辑在【假 IndexedDB】与【localStorage 兜底】两种后端下各跑一遍：
      写入 → 导出 JSON → 导入覆盖恢复 → 字段完整性 → 非法文件拒绝 →
      清空（确认弹窗拦截时不清，确认通过后清空，并验证已落盘）。
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' —— ' + extra : '')); }
}

/* ---------- 1) 提取 index.html 内联脚本并做语法检查 ---------- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到内联 <script>'); process.exit(1); }
const script = m[1];
check('index.html 内含唯一内联脚本', (html.match(/<script>/g) || []).length === 1);
try { new Function(script); check('内联脚本语法正确', true); }
catch (e) { check('内联脚本语法正确', false, e.message); }

/* ---------- 2) sw.js 语法（用 new Function 解析函数体，等价于语法检查） ---------- */
try {
  new Function(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
  check('sw.js 语法正确', true);
} catch (e) { check('sw.js 语法正确', false, e.message); }

/* ---------- 3) manifest.json 与图标 ---------- */
try {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  check('manifest.json 合法', true);
  check('manifest 含 3 个图标声明', Array.isArray(man.icons) && man.icons.length >= 3);
} catch (e) { check('manifest.json 合法', false, e.message); }
for (const icon of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
  const p = path.join(root, icon);
  check(icon + ' 存在且非空', fs.existsSync(p) && fs.statSync(p).size > 100);
}

/* ---------- 4) 核心逻辑跑测（两种后端各跑一遍） ---------- */

/* 假 localStorage */
function makeFakeLS() {
  const map = new Map();
  return {
    getItem: k => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
}
/* 假 IndexedDB（实现应用用到的极小接口子集：open/getAll/put/delete/clear） */
function makeFakeIDB() {
  let storeData = new Map();
  const req = result => ({ result, onsuccess: null, onerror: null });
  const store = {
    getAll() { const r = req([...storeData.values()]); queueMicrotask(() => r.onsuccess && r.onsuccess()); return r; },
    put(rec) { const r = req(undefined); queueMicrotask(() => { storeData.set(rec.date, rec); r.onsuccess && r.onsuccess(); }); return r; },
    delete(key) { const r = req(undefined); queueMicrotask(() => { storeData.delete(key); r.onsuccess && r.onsuccess(); }); return r; },
    clear() { const r = req(undefined); queueMicrotask(() => { storeData.clear(); r.onsuccess && r.onsuccess(); }); return r; }
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => store })
  };
  const open = () => { const r = req(db); queueMicrotask(() => r.onsuccess && r.onsuccess()); return r; };
  return { open };
}

async function runSuite(label, useFakeIDB) {
  console.log('\n—— 核心逻辑跑测：' + label + ' ——');
  global.localStorage = makeFakeLS();
  if (useFakeIDB) global.indexedDB = makeFakeIDB(); else delete global.indexedDB;
  global.window = global;                       // 让脚本把测试钩子 __LT__ 挂到 window
  global.confirm = () => true;
  let LT;
  try { new Function(script)(); LT = global.__LT__; }
  catch (e) { check(label + ' 可加载', false, e.message); return; }
  check(label + ' 可加载', true);

  await LT.initStorage();
  check(label + ' 后端探测正确', LT.backendName() === (useFakeIDB ? 'IndexedDB' : 'localStorage（兜底）'));

  /* 写入两条记录（体重/资产/计划/健康打卡齐全） */
  await LT.saveRecord({ date: '2026-01-15', weight: 65.2,
    assets: [{ id: 'a1', amount: 12000, note: '工资到账', ts: 1000 }],
    plans: [{ id: 'p1', text: '买药', done: false }],
    health: { medicine: true, brush: false } });
  await LT.saveRecord({ date: '2026-01-14', weight: null,
    assets: [{ id: 'a2', amount: 11500, note: '存款', ts: 2000 }],
    plans: [], health: { medicine: false, brush: false } });
  check(label + ' 写入 2 天记录并落盘', (await LT.Storage.readAll()).length === 2);

  /* 导出 → 导入（覆盖）→ 数据一致 */
  const json = JSON.stringify(LT.buildExport());
  check(label + ' 导出为含标识的 JSON', typeof json === 'string' && json.includes('life-tracker'));
  const res = await LT.importBackup(json);
  check(label + ' 导入成功且覆盖（确认弹窗放行）', res.ok === true && res.count === 2);
  const back = await LT.Storage.readAll();
  const d15 = back.find(r => r.date === '2026-01-15');
  check(label + ' 导入后字段完整', !!d15 && d15.weight === 65.2 &&
    d15.assets.length === 1 && d15.plans.length === 1 &&
    d15.health.medicine === true && d15.health.brush === false);

  /* 非法导入必须被拒绝 */
  check(label + ' 非法 JSON 被拒绝', (await LT.importBackup('{{{ 不是JSON')).ok === false);
  check(label + ' 非本应用备份被拒绝', (await LT.importBackup(JSON.stringify({ foo: 1 }))).ok === false);

  /* 清空：确认弹窗取消时不删 */
  global.confirm = () => false;
  const cancelled = await LT.requestClearAll();
  check(label + ' 清空被确认弹窗拦截（数据保留）', cancelled === false && (await LT.Storage.readAll()).length === 2);
  /* 清空：确认通过时真正清空并落盘 */
  global.confirm = () => true;
  const cleared = await LT.requestClearAll();
  check(label + ' 确认后清空全部并落盘', cleared === true &&
    LT.DATA.length === 0 && (await LT.Storage.readAll()).length === 0);

  /* 覆盖导入：导入一个空备份文件也应能清空现有数据（覆盖语义） */
  const empty = JSON.stringify({ app: 'life-tracker', version: 1, records: [] });
  const resEmpty = await LT.importBackup(empty);
  check(label + ' 导入空备份（覆盖为 0 天）', resEmpty.ok === true && resEmpty.count === 0);
}

(async () => {
  await runSuite('假 IndexedDB 后端', true);
  await runSuite('localStorage 兜底后端', false);
  console.log('\n' + (failures === 0 ? '✅ 全部检查通过' : '❌ 共 ' + failures + ' 项未通过'));
  process.exit(failures === 0 ? 0 : 1);
})();
