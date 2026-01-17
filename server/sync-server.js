const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3001;

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error("只支持图片文件"));
        }
    },
});

// 中间件
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// 静态文件服务 - 提供上传的图片访问
app.use("/uploads", express.static(UPLOAD_DIR));

// ─── 数据存储（内存） ─────────────────────────────────────────

/** 全局序号计数器 */
let seqCounter = 0;

/** 事件数组 */
let events = [];

/** 画布全量数据 */
let canvasJSON = null;

/** SSE 客户端连接列表 */
const sseClients = new Map();

// ─── SSE 广播 ─────────────────────────────────────────

/**
 * 向所有客户端广播事件
 */
function broadcast(event) {
    const message = JSON.stringify({
        type: "sync_event",
        data: event,
    });

    sseClients.forEach((res, clientId) => {
        res.write(`data: ${message}\n\n`);
    });

    console.log(`[广播] seq=${event.seq}, eventType=${event.eventType}, 客户端数=${sseClients.size}`);
}


// ─── 接口 ─────────────────────────────────────────

/**
 * SSE 连接端点
 * GET /api/canvas/sync/sse?clientId=xxx
 */
app.get("/api/canvas/sync/sse", (req, res) => {
    const clientId = req.query.clientId;
    if (!clientId) {
        return res.status(400).json({ error: "缺少 clientId" });
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 发送初始连接成功消息
    res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    // 注册客户端
    sseClients.set(clientId, res);
    console.log(`[SSE] 客户端连接: ${clientId}, 当前连接数: ${sseClients.size}`);

    // 客户端断开时清理
    req.on("close", () => {
        sseClients.delete(clientId);
        console.log(`[SSE] 客户端断开: ${clientId}, 当前连接数: ${sseClients.size}`);
    });
});

/**
 * 推送同步事件
 * POST /api/canvas/sync/event
 */
app.post("/api/canvas/sync/event", (req, res) => {
    const { eventType, data } = req.body;

    if (!eventType || !data) {
        return res.status(400).json({ error: "缺少 eventType 或 data" });
    }

    // 分配全局序号
    seqCounter++;
    const event = {
        seq: seqCounter,
        eventType,
        data,
    };

    // 存入事件数组
    events.push(event);

    console.log(`[事件] seq=${event.seq}, eventType=${eventType}, 事件总数=${events.length}`);

    // 广播给所有客户端
    broadcast(event);

    // 返回响应
    res.json({
        seq: event.seq,
        eventArrayLength: events.length,
    });
});

/**
 * 上传全量画布数据
 * POST /api/canvas/sync/full
 */
app.post("/api/canvas/sync/full", (req, res) => {
    const { clientId, canvasJSON: newCanvasJSON } = req.body;

    if (!clientId || !newCanvasJSON) {
        return res.status(400).json({ error: "缺少 clientId 或 canvasJSON" });
    }

    // 存储全量数据
    canvasJSON = newCanvasJSON;

    // 清空事件数组
    events = [];

    console.log(`[全量同步] clientId=${clientId}, 事件数组已清空`);

    res.json({ success: true });
});

/**
 * 获取初始化数据
 * GET /api/canvas/sync/full_data
 */
app.get("/api/canvas/sync/full_data", (req, res) => {
    console.log(`[初始化] 返回全量数据和 ${events.length} 个事件`);

    res.json({
        canvasJSON,
        events,
    });
});

/**
 * 调试接口：查看当前状态
 * GET /api/canvas/sync/debug
 */
app.get("/api/canvas/sync/debug", (req, res) => {
    res.json({
        seqCounter,
        eventsCount: events.length,
        events: events.slice(-10), // 只返回最近10条
        hasCanvasJSON: canvasJSON !== null,
        connectedClients: Array.from(sseClients.keys()),
    });
});

/**
 * 调试接口：重置所有数据
 * POST /api/canvas/sync/reset
 */
app.post("/api/canvas/sync/reset", (req, res) => {
    seqCounter = 0;
    events = [];
    canvasJSON = null;
    console.log("[重置] 所有数据已清空");
    res.json({ success: true });
});


/**
 * 调试接口：后端主动插入图片
 * POST /api/canvas/sync/inject_image
 * 后端只负责传递图片 URL，前端负责封装为 HistoryRecord
 */
app.post("/api/canvas/sync/inject_image", (req, res) => {
    let { urls } = req.body;

    // 如果没有传 urls，从 uploads 目录随机选一张图片
    if (!urls || urls.length === 0) {
        const files = fs.readdirSync(UPLOAD_DIR).filter((f) =>
            /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
        );

        if (files.length === 0) {
            return res.status(400).json({ error: "uploads 目录下没有图片，且未提供 urls 参数" });
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];
        urls = [`http://localhost:${PORT}/uploads/${randomFile}`];
    }

    // 构造 server:add_image 事件
    seqCounter++;
    const event = {
        seq: seqCounter,
        eventType: "server:add_image",
        data: {
            urls,
        },
    };
    events.push(event);

    // 广播给所有客户端
    broadcast(event);

    console.log(`[注入图片] seq=${event.seq}, urls=${urls}`);

    res.json({
        success: true,
        seq: event.seq,
        urls,
    });
});

// ─── 图片上传接口 ─────────────────────────────────────────

/**
 * 上传图片
 * POST /api/upload/image
 * 返回图片的访问 URL
 */
app.post("/api/upload/image", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "没有上传文件" });
    }

    const url = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    console.log(`[上传] 图片已保存: ${req.file.filename}`);

    res.json({
        success: true,
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
    });
});

// ─── 启动服务器 ─────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  画布同步服务器已启动`);
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`========================================\n`);
    console.log(`接口列表:`);
    console.log(`  GET  /api/canvas/sync/sse?clientId=xxx  - SSE 连接`);
    console.log(`  POST /api/canvas/sync/event             - 推送事件`);
    console.log(`  POST /api/canvas/sync/full              - 全量同步`);
    console.log(`  GET  /api/canvas/sync/full_data         - 获取初始化数据`);
    console.log(`  GET  /api/canvas/sync/debug             - 调试状态`);
    console.log(`  POST /api/canvas/sync/reset             - 重置数据`);
    console.log(`  POST /api/canvas/sync/inject_image      - 后端注入图片`);
    console.log(`  POST /api/upload/image                  - 上传图片`);
    console.log(`  GET  /uploads/:filename                 - 访问图片\n`);
});
