import os
from dotenv import load_dotenv

# Load variables from .env file into the environment
load_dotenv()

# Server configuration — read from .env with sensible defaults
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Origins the browser is allowed to connect from (CORS whitelist)
# In development this is localhost:5500 (Live Server) and localhost:8080
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080"
).split(",")
