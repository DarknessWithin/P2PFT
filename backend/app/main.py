import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.websocket_manager import ConnectionManager
from app.room_manager import RoomManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="P2P Web Share",
    description="Signaling server — file data never passes through",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager      = ConnectionManager()
room_manager = RoomManager()


@app.get("/")
async def health():
    return {"status": "ok", "active_connections": len(manager.active_connections)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logger.info("Client connected")

    try:
        await manager.send_message(websocket, {
            "type": "welcome",
            "message": "Connected to P2P Web Share Server",
        })

        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_message(websocket, {
                    "type": "error",
                    "message": "Invalid JSON",
                })
                continue

            msg_type = data.get("type")

            # ── create_room ───────────────────────────────────────────────────
            if msg_type == "create_room":
                room_id = room_manager.create_room(websocket)
                await manager.send_message(websocket, {
                    "type":    "room_created",
                    "room_id": room_id,
                })
                logger.info(f"Room created: {room_id}")

            # ── join_room ─────────────────────────────────────────────────────
            elif msg_type == "join_room":
                room_id = str(data.get("room_id", "")).strip().upper()

                if not room_id:
                    await manager.send_message(websocket, {
                        "type": "error", "message": "Room ID is required",
                    })
                    continue

                success, error_msg = room_manager.join_room(room_id, websocket)

                if not success:
                    await manager.send_message(websocket, {
                        "type": "error", "message": error_msg,
                    })
                    continue

                # Notify guest
                await manager.send_message(websocket, {
                    "type": "joined_room", "room_id": room_id,
                })

                # Notify host
                host = room_manager.get_host(room_id)
                if host:
                    await manager.send_message(host, {
                        "type": "peer_joined", "room_id": room_id,
                    })

                logger.info(f"Guest joined room: {room_id}")

            # ── signaling relay — Phase 3 ─────────────────────────────────────
            elif msg_type in ("offer", "answer", "ice_candidate"):
                peer = room_manager.get_peer(websocket)
                if peer is None:
                    await manager.send_message(websocket, {
                        "type": "error", "message": "No peer in room to relay signal to",
                    })
                    continue
                await manager.send_message(peer, data)
                logger.debug(f"Relayed '{msg_type}' to peer")

            else:
                logger.debug(f"Unknown message type: {msg_type!r}")

    except WebSocketDisconnect:
        await _handle_disconnect(websocket)

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await _handle_disconnect(websocket)


async def _handle_disconnect(websocket: WebSocket) -> None:
    room_id, role, peer = room_manager.remove_connection(websocket)
    manager.disconnect(websocket)
    logger.info(f"Client disconnected (was {role} in room {room_id})")

    if room_id is None or peer is None:
        return

    try:
        if role == "host":
            await manager.send_message(peer, {
                "type": "room_closed", "message": "Host left. Room closed.",
            })
        else:
            await manager.send_message(peer, {
                "type": "peer_disconnected", "message": "Peer left the room.",
            })
    except Exception:
        logger.debug(f"Could not notify peer in room {room_id} — peer may already be gone")
