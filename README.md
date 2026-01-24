# Canvas Editor

基于 FabricJS 的画布编辑器组件，采用插件化架构。

## 开发

```bash
npm install

# 首次运行需要先构建 DLL（预编译第三方依赖，加速开发构建）
npm run dll:dev

# 启动开发服务器
npm run dev

# 启动同步服务器（可选，用于多端同步功能）
cd server
pip install fastapi uvicorn aiofiles python-multipart
python sync_server.py
```

## 构建

```bash
# 构建组件库（供主项目使用）
npm run build:lib
```

## 使用

```tsx
import { CanvasEditor } from 'your-lib-name';

<CanvasEditor
  width="100%"
  height="600px"
  syncEnabled={false}
  onReady={(editor) => console.log('ready', editor)}
/>
```

## 目录结构

```
src/
├── exports/                 # 组件库导出入口
├── Pages/TestPage33/        # 画布编辑器核心
│   ├── CanvasEditor/        # 导出组件（主项目使用）
│   ├── core/                # 核心模块
│   │   ├── editor/          # 编辑器主类
│   │   ├── event/           # 事件总线
│   │   ├── history/         # 历史记录/撤销重做
│   │   ├── hotkey/          # 快捷键管理
│   │   ├── dom/             # DOM 层渲染
│   │   ├── object/          # 对象元数据
│   │   └── sync/            # 多端同步
│   ├── plugins/             # 插件系统
│   │   ├── draw/            # 绘制插件
│   │   ├── selection/       # 选择/工具栏
│   │   ├── viewport/        # 缩放/平移
│   │   ├── io/              # 导入导出
│   │   └── ...
│   └── hooks/               # React Hooks
lib/                         # 构建产物
```

## DLL 机制说明

项目使用 Webpack DLL 插件预编译第三方依赖（react、react-redux、axios 等），原理：

1. `npm run dll:dev` 将第三方库打包成 `dll/Vendor.dll.js`，同时生成 `Vendor-manifest.json` 映射文件
2. 开发构建时通过 `DllReferencePlugin` 引用映射文件，跳过这些库的编译
3. 开发服务器通过 `AddAssetPlugin` 自动注入 DLL 脚本

好处：第三方库只编译一次，后续开发构建只处理业务代码，显著提升热更新速度。

> 注：开发服务器端口随机分配，启动后查看控制台输出获取实际端口。

## 同步服务器

`server/sync_server.py` 是基于 FastAPI 的画布同步服务，用于多端实时协作：

- SSE 推送：服务端主动推送画布变更给所有客户端
- 事件同步：客户端变更通过 `/api/canvas/sync/event` 上报，广播给其他客户端
- 图片上传：支持图片上传并返回访问 URL
- 内存存储：画布数据存储在内存中，重启后清空

接口列表：
| 接口 | 说明 |
|------|------|
| `GET /api/canvas/sync/sse` | SSE 连接 |
| `POST /api/canvas/sync/event` | 推送事件 |
| `GET /api/canvas/sync/full_data` | 获取画布全量数据 |
| `POST /api/upload/image` | 上传图片 |

服务默认运行在 `http://localhost:3001`。
