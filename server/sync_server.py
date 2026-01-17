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

seq_counter = 0
events: List[Dict[str, Any]] = []
canvas_json: Optional[Dict[str, Any]] = None
sse_clients: Dict[str, asyncio.Queue] = {}

# ─── Pydantic 模型 ─────────────────────────────────────────

class ClientChangeData(BaseModel):
    clientId: str
    snapshot: Dict[str, Any] | List[Dict[str, Any]]

class ServerAddImageData(BaseModel):
    urls: List[str]

class SyncEventRequest(BaseModel):
    eventType: Literal["client:change", "server:add_image"]
    data: Dict[str, Any]

class FullSyncRequest(BaseModel):
    clientId: str
    canvasJSON: Dict[str, Any]

class InjectImageRequest(BaseModel):
    urls: Optional[List[str]] = None  # 可选，不传则从 uploads 随机选

# ─── SSE 广播 ─────────────────────────────────────────

async def broadcast(event: Dict[str, Any]):
    """向所有客户端广播事件"""
    message = json.dumps({"type": "sync_event", "data": event})
    
    for client_id, queue in list(sse_clients.items()):
        try:
            await queue.put(message)
        except Exception as e:
            print(f"[广播错误] clientId={client_id}, error={e}")
    
    print(f"[广播] seq={event['seq']}, eventType={event['eventType']}, 客户端数={len(sse_clients)}")


# ─── 接口 ─────────────────────────────────────────

@app.get("/api/canvas/sync/sse")
async def sse_endpoint(clientId: str = Query(..., description="客户端ID")):
    """SSE 连接端点"""
    
    async def event_generator():
        queue = asyncio.Queue()
        sse_clients[clientId] = queue
        print(f"[SSE] 客户端连接: {clientId}, 当前连接数: {len(sse_clients)}")
        
        try:
            # 发送初始连接成功消息
            yield f"data: {json.dumps({'type': 'connected', 'clientId': clientId})}\n\n"
            
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
            sse_clients.pop(clientId, None)
            print(f"[SSE] 客户端断开: {clientId}, 当前连接数: {len(sse_clients)}")
    
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
async def push_sync_event(request: SyncEventRequest):
    """推送同步事件"""
    global seq_counter
    
    seq_counter += 1
    event = {
        "seq": seq_counter,
        "eventType": request.eventType,
        "data": request.data,
    }
    
    events.append(event)
    print(f"[事件] seq={event['seq']}, eventType={request.eventType}, 事件总数={len(events)}")
    
    await broadcast(event)
    
    return {"seq": event["seq"], "eventArrayLength": len(events)}


@app.post("/api/canvas/sync/full")
async def full_sync(request: FullSyncRequest):
    """上传全量画布数据"""
    global canvas_json, events
    
    canvas_json = request.canvasJSON
    events = []
    
    print(f"[全量同步] clientId={request.clientId}, 事件数组已清空")
    
    return {"success": True}


@app.get("/api/canvas/sync/full_data")
async def get_full_data():
    """获取初始化数据"""
    print(f"[初始化] 返回全量数据和 {len(events)} 个事件")
    
    return {"canvasJSON": canvas_json, "events": events}


@app.get("/api/canvas/sync/debug")
async def debug_status():
    """调试接口：查看当前状态"""
    return {
        "seqCounter": seq_counter,
        "eventsCount": len(events),
        "events": events[-10:],  # 只返回最近10条
        "hasCanvasJSON": canvas_json is not None,
        "connectedClients": list(sse_clients.keys()),
    }


@app.post("/api/canvas/sync/reset")
async def reset_data():
    """调试接口：重置所有数据"""
    global seq_counter, events, canvas_json
    
    seq_counter = 0
    events = []
    canvas_json = None
    
    print("[重置] 所有数据已清空")
    return {"success": True}


@app.post("/api/canvas/sync/inject_image")
async def inject_image(request: InjectImageRequest = InjectImageRequest()):
    """
    调试接口：后端主动插入图片
    后端只负责传递图片 URL，前端负责封装为 HistoryRecord
    """
    global seq_counter
    
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
    
    # 构造 server:add_image 事件
    seq_counter += 1
    event = {
        "seq": seq_counter,
        "eventType": "server:add_image",
        "data": {
            "urls": urls,
        },
    }
    events.append(event)
    
    # 广播给所有客户端
    await broadcast(event)
    
    print(f"[注入图片] seq={event['seq']}, urls={urls}")
    
    return {
        "success": True,
        "seq": event["seq"],
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
    print(f"  GET  /api/canvas/sync/sse?clientId=xxx  - SSE 连接")
    print(f"  POST /api/canvas/sync/event             - 推送事件")
    print(f"  POST /api/canvas/sync/full              - 全量同步")
    print(f"  GET  /api/canvas/sync/full_data         - 获取初始化数据")
    print(f"  GET  /api/canvas/sync/debug             - 调试状态")
    print(f"  POST /api/canvas/sync/reset             - 重置数据")
    print(f"  POST /api/canvas/sync/inject_image      - 后端注入图片")
    print(f"  POST /api/upload/image                  - 上传图片")
    print(f"  GET  /uploads/:filename                 - 访问图片\n")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)
