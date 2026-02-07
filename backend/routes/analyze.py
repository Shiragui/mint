import json
import re
import httpx
from fastapi import HTTPException
from pydantic import BaseModel

DEDALUS_VISION_MODEL = "google/gemini-2.0-flash"
DEDALUS_API = "https://api.dedaluslabs.ai/v1/chat/completions"


class AnalyzeRequest(BaseModel):
    image: str  # base64
    intent: str = "product"  # "product" | "location"
    mimeType: str = "image/png"


async def call_dedalus_vision(api_key: str, base64_image: str, mime_type: str) -> str:
    body = {
        "model": DEDALUS_VISION_MODEL,
        "max_tokens": 300,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Identify and briefly describe what is in this image: objects, clothing, makeup, or locations. Be concise (one or two sentences) and mention anything that could be a purchasable product or a real place.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{base64_image}",
                            "detail": "low",
                        },
                    },
                ],
            }
        ],
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            DEDALUS_API,
            json=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            timeout=30.0,
        )
    if r.status_code != 200:
        raise ValueError(f"{r.status_code} {r.text}")
    data = r.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
    if not isinstance(content, str):
        raise ValueError("Invalid Dedalus response")
    return content.strip()


async def get_similar_products(api_key: str, description: str) -> list[dict]:
    prompt = (
        f'The user selected an image region described as: "{description}". '
        'Suggest 3 to 5 similar or related products that could be purchased online. '
        'For each product provide a short name and a search query (keywords). '
        'Reply with ONLY a valid JSON array of objects with keys "name" and "search_query". '
        'Example: [{"name": "Wireless Mouse", "search_query": "wireless bluetooth mouse"}]'
    )
    body = {
        "model": DEDALUS_VISION_MODEL,
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            DEDALUS_API,
            json=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            timeout=30.0,
        )
    if r.status_code != 200:
        return []
    data = r.json()
    raw = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    parsed = _parse_similar_products(raw)
    return [p for p in parsed if isinstance(p.get("name"), str) and isinstance(p.get("search_query"), str)]


def _parse_similar_products(text: str) -> list:
    if not text or not text.strip():
        return []
    trimmed = text.strip()
    json_str = trimmed
    code = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed)
    if code:
        json_str = code.group(1).strip()
    else:
        start, end = trimmed.find("["), trimmed.rfind("]") + 1
        if start != -1 and end > start:
            json_str = trimmed[start:end]
    try:
        return json.loads(json_str)
    except Exception:
        return []


async def analyze(body: AnalyzeRequest, user_id: str | None, api_key: str) -> dict:
    if not api_key:
        raise HTTPException(status_code=500, detail="DEDALUS_API_KEY is not set on the server")
    try:
        description = await call_dedalus_vision(api_key, body.image, body.mimeType or "image/png")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    similar_products = await get_similar_products(api_key, description)
    return {
        "description": description,
        "similarProducts": similar_products,
        "results": [
            {"type": "product", "name": p["name"], "search_query": p["search_query"]}
            for p in similar_products
        ],
    }
