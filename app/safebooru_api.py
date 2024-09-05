import requests

SAFEBOORU_API_URL = "https://safebooru.org/index.php?page=dapi&s=post&q=index"

def fetch_content(tags, content_type, limit=100):
    params = {
        "tags": tags,
        "limit": limit,
        "json": 1,
    }
    if content_type == "image":
        params["tags"] += " -video"
    elif content_type == "video":
        params["tags"] += " video"
    
    response = requests.get(SAFEBOORU_API_URL, params=params)
    return response.json()

def process_safebooru_content(content_data):
    return {
        "id": content_data["id"],
        "url": f"https://safebooru.org/images/{content_data['directory']}/{content_data['image']}",
        "tags": content_data["tags"],
        "content_type": "video" if content_data["image"].endswith((".mp4", ".webm")) else "image"
    }