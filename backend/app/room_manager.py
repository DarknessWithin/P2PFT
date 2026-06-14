import random
import string
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class RoomManager:
    """
    Manages all in-memory rooms.

    Room structure:
        rooms = {
            "AB12CD": {
                "host":  <WebSocket>,   # creator of the room — always present
                "guest": <WebSocket> | None   # joiner — None until someone joins
            }
        }

    Phase 2 responsibilities:
      - Generate unique 6-character room IDs
      - Create rooms and store the host socket
      - Add guests to existing rooms (with validation)
      - Remove connections on disconnect and return the peer so main.py can notify them
    """

    def __init__(self):
        # In-memory room dictionary.  Key = room_id, value = {"host": ws, "guest": ws | None}
        self.rooms: dict[str, dict] = {}

    # ── ID generation ─────────────────────────────────────────────────────────

    def _generate_room_id(self) -> str:
        """Return a random 6-character uppercase alphanumeric string not already in use."""
        characters = string.ascii_uppercase + string.digits
        while True:
            room_id = "".join(random.choices(characters, k=6))
            if room_id not in self.rooms:
                return room_id

    # ── Room lifecycle ────────────────────────────────────────────────────────

    def create_room(self, websocket: WebSocket) -> str:
        """
        Create a new room with `websocket` as the host.
        Returns the generated room_id.
        """
        room_id = self._generate_room_id()
        self.rooms[room_id] = {"host": websocket, "guest": None}
        logger.info(f"Room created: {room_id}. Total rooms: {len(self.rooms)}")
        return room_id

    def join_room(self, room_id: str, websocket: WebSocket) -> tuple[bool, str]:
        """
        Attempt to add `websocket` as the guest of `room_id`.

        Returns:
            (True, "")          on success
            (False, reason)     on failure — reason is the error message to send to the client
        """
        if room_id not in self.rooms:
            logger.warning(f"Join attempt failed — room not found: {room_id}")
            return False, "Room not found"

        if self.rooms[room_id]["guest"] is not None:
            logger.warning(f"Join attempt failed — room already full: {room_id}")
            return False, "Room already has two participants"

        self.rooms[room_id]["guest"] = websocket
        logger.info(f"Guest joined room: {room_id}")
        return True, ""

    # ── Lookup helpers ────────────────────────────────────────────────────────

    def get_host(self, room_id: str) -> WebSocket | None:
        """Return the host socket for a room, or None if the room does not exist."""
        return self.rooms.get(room_id, {}).get("host")

    def get_guest(self, room_id: str) -> WebSocket | None:
        """Return the guest socket for a room, or None if no guest has joined."""
        return self.rooms.get(room_id, {}).get("guest")

    def get_peer(self, websocket: WebSocket) -> WebSocket | None:
        """
        Return the other participant's socket for whatever room `websocket` is in.
        Used by the signaling relay — finds the peer without needing a room_id.
        Returns None if the caller is not in a room or has no peer yet.
        """
        room_id, role = self.find_room_for(websocket)
        if room_id is None:
            return None
        if role == "host":
            return self.rooms[room_id]["guest"]
        return self.rooms[room_id]["host"]

    def find_room_for(self, websocket: WebSocket) -> tuple[str | None, str | None]:
        """
        Find the room and role for a given WebSocket.

        Returns:
            (room_id, "host")   if the socket is a host
            (room_id, "guest")  if the socket is a guest
            (None, None)        if the socket is not in any room
        """
        for room_id, participants in self.rooms.items():
            if participants["host"] is websocket:
                return room_id, "host"
            if participants["guest"] is websocket:
                return room_id, "guest"
        return None, None

    # ── Disconnect cleanup ────────────────────────────────────────────────────

    def remove_connection(self, websocket: WebSocket) -> tuple[str | None, str | None, WebSocket | None]:
        """
        Remove `websocket` from its room (if any) and return enough info
        for main.py to notify the other participant.

        Returns:
            (room_id, role, peer_websocket)

            - room_id        — the room the socket was in (None if not in a room)
            - role           — "host" or "guest"
            - peer_websocket — the other participant's socket (None if no peer yet)

        Side effects:
            - Host leaves   → room is deleted entirely
            - Guest leaves  → guest slot is cleared (room stays open for a new guest)
        """
        room_id, role = self.find_room_for(websocket)

        if room_id is None:
            # This socket was not in any room
            return None, None, None

        if role == "host":
            peer = self.rooms[room_id]["guest"]   # may be None if no guest joined yet
            del self.rooms[room_id]
            logger.info(f"Room deleted — host left: {room_id}. Total rooms: {len(self.rooms)}")
            return room_id, "host", peer

        else:  # role == "guest"
            peer = self.rooms[room_id]["host"]
            self.rooms[room_id]["guest"] = None   # clear guest slot — room stays alive
            logger.info(f"Guest removed from room: {room_id}. Room is open for a new guest.")
            return room_id, "guest", peer
