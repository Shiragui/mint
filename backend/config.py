import os
from dotenv import load_dotenv

load_dotenv()

DEDALUS_API_KEY = os.getenv("DEDALUS_API_KEY", "")
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "1").strip().lower() in ("1", "true", "yes")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
