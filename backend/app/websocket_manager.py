import json
import logging
from fastapi import WebSocket

# Module-level logger — messages appear in the terminal where uvicorn runs
logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages all active WebSocket connections.

    Phase 1 responsibility:
      - Accept incoming connections and store them
      - Remove connections when a client disconnects
      - Send JSON messages to a single connected client
    """

    def __init__(self):
        # List that holds every currently-open WebSocket
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept the handshake and register the connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"Client connected. Total active connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a connection from the active list (no await needed — already closed)."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"Client disconnected. Total active connections: {len(self.active_connections)}"
        )

    async def send_message(self, websocket: WebSocket, message: dict):
        """Send a JSON payload to one specific client."""
        await websocket.send_text(json.dumps(message))
