import os
import random
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List, Literal, Union
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import aiofiles
import json

app = FastAPI(title="画布同步服务器")

PORT = 3001

# 确保上传目录存在
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 允许的图片类型
ALLOWED_EXTENSIONS = {".jpeg", ".jpg", ".png", ".gif", ".webp", ".svg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务 - 提供上传的图片访问
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ─── 数据存储（内存） ─────────────────────────────────────────

sequence_id = 0  # 自增序列号
canvas_data: List[Dict[str, Any]] = []  # 画布数据，ImageExportData 数组
sse_clients: Dict[str, asyncio.Queue] = {}

# ─── Pydantic 模型 ─────────────────────────────────────────

class SyncEventItem(BaseModel):
    """单个同步事件项"""
    event_type: Literal["client:change"]
    event_data: Dict[str, Any]  # ImageExportData 格式

class SyncPushRequest(BaseModel):
    """推送同步事件的请求体"""
    events: List[SyncEventItem]

class FullSyncRequest(BaseModel):
    """全量同步请求"""
    clientId: str
    canvasJSON: List[Dict[str, Any]]  # ImageExportData 数组

class InjectImageRequest(BaseModel):
    urls: Optional[List[str]] = None

# ─── 画布数据操作 ─────────────────────────────────────────

def merge_event_to_canvas(event_data: Dict[str, Any]) -> None:
    """
    将事件数据合并到画布中
    - 按 id 查找，找到则替换，找不到则 push
    """
    global canvas_data
    
    event_id = event_data.get("id")
    if not event_id:
        print(f"[警告] 事件数据缺少 id: {event_data}")
        return
    
    # 查找是否已存在
    found_index = -1
    for i, item in enumerate(canvas_data):
        if item.get("id") == event_id:
            found_index = i
            break
    
    if found_index >= 0:
        # 找到了，替换
        canvas_data[found_index] = event_data
        print(f"[合并] 替换对象 id={event_id}")
    else:
        # 没找到，push
        canvas_data.append(event_data)
        print(f"[合并] 新增对象 id={event_id}")

# ─── SSE 广播 ─────────────────────────────────────────

async def broadcast(event: Dict[str, Any]):
    """向所有客户端广播事件"""
    message = json.dumps({"type": "sync_event", "data": event})
    
    broadcast_count = 0
    for client_id, queue in list(sse_clients.items()):
        try:
            await queue.put(message)
            broadcast_count += 1
        except Exception as e:
            print(f"[广播错误] clientId={client_id}, error={e}")
    
    print(f"[广播] sequence_id={event.get('sequence_id')}, 广播给 {broadcast_count} 个客户端")


# ─── 接口 ─────────────────────────────────────────

@app.get("/api/canvas/sync/sse")
async def sse_endpoint():
    """SSE 连接端点"""
    import uuid
    connection_id = str(uuid.uuid4())[:8]  # 仅用于内部连接管理
    
    async def event_generator():
        queue = asyncio.Queue()
        sse_clients[connection_id] = queue
        print(f"[SSE] 客户端连接: {connection_id}, 当前连接数: {len(sse_clients)}")
        
        try:
            # 发送初始连接成功消息
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # 发送心跳保持连接
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_clients.pop(connection_id, None)
            print(f"[SSE] 客户端断开: {connection_id}, 当前连接数: {len(sse_clients)}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )


@app.post("/api/canvas/sync/event")
async def push_sync_event(request: SyncPushRequest):
    """
    推送同步事件
    - 接收 events 数组
    - 每个 event 合并到画布数据中
    - sequence_id 自增
    - 先返回响应，再异步广播（让前端更快拿到新 sequence_id）
    """
    global sequence_id
    
    # 收集待广播的事件
    broadcast_events = []
    
    for event_item in request.events:
        # sequence_id 自增
        sequence_id += 1
        
        # 合并到画布数据
        merge_event_to_canvas(event_item.event_data)
        
        # 构造广播事件
        broadcast_events.append({
            "sequence_id": sequence_id,
            "event_type": event_item.event_type,
            "event_data": event_item.event_data,
        })
    
    print(f"[事件] 处理 {len(request.events)} 个事件, sequence_id={sequence_id}, 画布对象数={len(canvas_data)}")
    
    # 异步广播（不阻塞响应）
    asyncio.create_task(broadcast_all(broadcast_events))
    
    return {"sequence_id": sequence_id}


async def broadcast_all(events: List[Dict[str, Any]]):
    """批量广播事件"""
    for event in events:
        await broadcast(event)


@app.post("/api/canvas/sync/full")
async def full_sync(request: FullSyncRequest):
    """上传全量画布数据"""
    global canvas_data
    
    canvas_data = request.canvasJSON
    
    print(f"[全量同步] clientId={request.clientId}, 画布对象数={len(canvas_data)}")
    
    return {"success": True}


@app.get("/api/canvas/sync/full_data")
async def get_full_data():
    """获取初始化数据（画布全量数据）"""
    print(f"[初始化] 返回画布数据, 对象数={len(canvas_data)}")
    
    return {
        "canvasJSON": canvas_data,
        "sequence_id": sequence_id,
    }


@app.get("/api/canvas/sync/debug")
async def debug_status():
    """调试接口：查看当前状态"""
    return {
        "sequence_id": sequence_id,
        "canvasDataCount": len(canvas_data),
        "canvasData": canvas_data,
        "connectedClients": list(sse_clients.keys()),
    }


@app.post("/api/canvas/sync/reset")
async def reset_data():
    """调试接口：重置所有数据"""
    global sequence_id, canvas_data
    
    sequence_id = 0
    canvas_data = []
    
    print("[重置] 所有数据已清空")
    return {"success": True}


@app.post("/api/canvas/sync/inject_image")
async def inject_image(request: InjectImageRequest = InjectImageRequest()):
    """
    调试接口：后端主动插入图片
    构造 ImageExportData 格式的数据并广播
    """
    global sequence_id
    
    urls = request.urls
    
    # 如果没有传 urls 或为空数组，从 uploads 目录随机选一张图片
    if not urls or len(urls) == 0:
        files = [
            f for f in os.listdir(UPLOAD_DIR)
            if Path(f).suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        ]
        
        if not files:
            raise HTTPException(status_code=400, detail="uploads 目录下没有图片，且未提供 urls 参数")
        
        random_file = random.choice(files)
        urls = [f"http://localhost:{PORT}/uploads/{random_file}"]
    
    injected_ids = []
    
    for url in urls:
        sequence_id += 1
        
        # 生成唯一 ID
        img_id = f"img_server_{sequence_id}_{random.randint(0, 10**6)}"
        
        # 构造 ImageExportData 格式
        event_data = {
            "id": img_id,
            "metadata": {
                "category": "image",
                "id": img_id,
                "src": url,
                "is_delete": False,
            },
            "style": {
                "matrix": [1, 0, 0, 1, 400, 300],  # 默认位置
            },
        }
        
        # 合并到画布数据
        merge_event_to_canvas(event_data)
        
        # 构造广播事件
        broadcast_event = {
            "sequence_id": sequence_id,
            "event_type": "server:add_image",
            "event_data": event_data,
        }
        
        # 广播给所有客户端
        await broadcast(broadcast_event)
        
        injected_ids.append(img_id)
    
    print(f"[注入图片] 注入 {len(urls)} 张图片, sequence_id={sequence_id}")
    
    return {
        "success": True,
        "sequence_id": sequence_id,
        "ids": injected_ids,
        "urls": urls,
    }


# ─── 图片上传接口 ─────────────────────────────────────────

@app.post("/api/upload/image")
async def upload_image(image: UploadFile = File(...)):
    """上传图片，返回图片的访问 URL"""
    
    # 检查文件类型
    ext = Path(image.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="只支持图片文件")
    
    # 生成唯一文件名
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}-{random.randint(0, 10**9)}"
    filename = f"{unique_suffix}{ext}"
    filepath = UPLOAD_DIR / filename
    
    # 保存文件
    content = await image.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")
    
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)
    
    url = f"http://localhost:{PORT}/uploads/{filename}"
    print(f"[上传] 图片已保存: {filename}")
    
    return {
        "success": True,
        "url": url,
        "filename": filename,
        "originalName": image.filename,
        "size": len(content),
    }


# ─── 启动服务器 ─────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    print(f"\n========================================")
    print(f"  画布同步服务器已启动")
    print(f"  地址: http://localhost:{PORT}")
    print(f"========================================\n")
    print(f"接口列表:")
    print(f"  GET  /api/canvas/sync/sse               - SSE 连接")
    print(f"  POST /api/canvas/sync/event             - 推送事件")
    print(f"  POST /api/canvas/sync/full              - 全量同步")
    print(f"  GET  /api/canvas/sync/full_data         - 获取初始化数据")
    print(f"  GET  /api/canvas/sync/debug             - 调试状态")
    print(f"  POST /api/canvas/sync/reset             - 重置数据")
    print(f"  POST /api/canvas/sync/inject_image      - 后端注入图片")
    print(f"  POST /api/upload/image                  - 上传图片")
    print(f"  GET  /uploads/:filename                 - 访问图片\n")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)
