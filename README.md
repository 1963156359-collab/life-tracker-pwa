# 📒 生活记录（纯本地离线 PWA）

自用记录工具：**体重 / 存款资产 / 每日计划 / 健康打卡** + 数据备份管理。
数据 100% 保存在本机浏览器，无后端、无任何网络请求、无埋点。

## 文件清单

| 文件 | 说明 |
|---|---|
| `index.html` | 应用本体（单文件，含全部逻辑与样式，可直接双击打开） |
| `manifest.json` | PWA 清单（应用名、图标、独立窗口模式） |
| `sw.js` | Service Worker（离线缓存） |
| `icon-192.png` / `icon-512.png` / `icon-512-maskable.png` | 安装图标（脚本生成，见 `tools/gen-icons.js`） |
| `tools/gen-icons.js` | 图标生成脚本（开发者工具，改图标时运行 `node tools/gen-icons.js`） |
| `tools/verify.js` | 自动验证脚本（`node tools/verify.js`，检查语法 + 导出/导入/清空逻辑） |
| `README.md` | 本说明 |

## 直接使用（电脑本地）

双击 `index.html` 即可用：录入体重、资产、计划、健康打卡，导出/导入/清空备份。
此时数据功能完整，但浏览器不允许 `file://` 注册 Service Worker，属于正常现象。

## 手机 PWA 安装（像 App 一样点开，离线可用）

需要让手机通过 `http(s)` 访问这 3 个文件（任选一种）：

```bash
# 方式一：Node（npx，无需安装依赖）
npx serve life-tracker-pwa

# 方式二：Python
cd life-tracker-pwa && python -m http.server 8080
```

然后把电脑与手机连同一 Wi-Fi，手机浏览器打开 `http://电脑IP:8080`：

- **Android（Chrome）**：菜单 →「添加到主屏幕 / 安装应用」，之后像 App 一样点开，离线可用；
- **iPhone（Safari）**：分享按钮 →「添加到主屏幕」。

之后更新 `index.html` 时，把 `sw.js` 顶部的 `CACHE_NAME` 版本号 +1 即可自动刷新缓存。

## 数据说明

- **存储**：优先 IndexedDB（容量大、更适合手机），浏览器不支持时自动回退 localStorage（页面底部会显示当前实际存储方式）；
- **导出备份**：下载 JSON 文件，含全部数据；
- **导入恢复**：覆盖式恢复（有确认弹窗），非本应用备份会被拒绝；
- **清空全部数据**：有确认弹窗拦截，防止误操作。

## 修改字段指南

数据模型与字段说明都在 `index.html` 内联脚本顶部的注释里（`emptyRecord` / `sanitizeRecord`）。
改字段：① 改这两个函数；② 改对应表单与渲染函数；③ 备份导入会自动兼容新结构。
