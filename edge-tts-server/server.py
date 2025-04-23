from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import edge_tts
import asyncio
import logging
import json

# Налаштування логування
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("tts-server")

app = FastAPI()

# Дозволяємо CORS для інтеграції з розширенням Chrome
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Модель для вхідних даних
class SpeakRequest(BaseModel):
    text: str
    voice: str = "uk-UA-PolinaNeural"  # Можна вибрати: uk-UA-PolinaNeural або uk-UA-OstapNeural
    rate: str = "+0%"  # Формат швидкості без десяткових дробів

# Український голоси
UKRAINIAN_VOICES = [
    "uk-UA-PolinaNeural",  # Жіночий голос
    "uk-UA-OstapNeural"    # Чоловічий голос
]

@app.get("/")
async def root():
    return {"status": "active", "service": "EdgeTTS API Server"}

@app.get("/voices")
async def list_voices():
    try:
        voices = await edge_tts.list_voices()
        # Відфільтровуємо тільки українські голоси
        ukrainian_voices = []
        
        for voice in voices:
            name = voice["Name"]
            language = voice["Locale"]
            gender = voice["Gender"]
            
            # Додаємо тільки якщо це один з українських голосів
            short_name = None
            if language == "uk-UA":
                if "(" in name and ")" in name:
                    info = name.split("(")[1].split(")")[0]
                    if ", " in info:
                        locale, voice_name = info.split(", ")
                        short_name = f"{locale}-{voice_name}"
                
                ukrainian_voices.append({
                    "name": name,
                    "short_name": short_name,
                    "language": language,
                    "gender": gender
                })
        
        return ukrainian_voices
    except Exception as e:
        logger.error(f"Помилка при отриманні списку голосів: {str(e)}")
        return {"error": str(e)}

@app.post("/speak")
async def speak(request: SpeakRequest):
    try:
        logger.info(f"Отримано запит на озвучення: '{request.text[:50]}...' голосом {request.voice}, швидкість: {request.rate}")
        
        # Перевіряємо текст
        if not request.text or len(request.text.strip()) == 0:
            return Response(
                content=json.dumps({"error": "Порожній текст"}),
                media_type="application/json",
                status_code=400
            )
        
        # Перевіряємо голос
        if request.voice not in UKRAINIAN_VOICES:
            logger.warning(f"Невідомий голос: {request.voice}, використовуємо uk-UA-PolinaNeural")
            request.voice = "uk-UA-PolinaNeural"
        
        # Максимальна довжина тексту для обробки
        if len(request.text) > 1000:
            logger.warning(f"Текст занадто довгий ({len(request.text)} символів), обрізаємо")
            request.text = request.text[:1000]
        
        try:
            # Створюємо об'єкт для синтезу мовлення з налаштуваннями швидкості
            communicate = edge_tts.Communicate(
                request.text,
                request.voice,
                rate=request.rate
            )
            
            # Отримуємо аудіо як потік
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            
            if not audio_data:
                logger.error("Не вдалося синтезувати аудіо")
                return Response(
                    content=json.dumps({"error": "Не вдалося синтезувати аудіо"}),
                    media_type="application/json",
                    status_code=500
                )

            logger.info(f"Аудіо успішно синтезовано: {len(audio_data)} байт")
            # Повертаємо аудіо як відповідь
            return Response(content=audio_data, media_type="audio/mpeg")
            
        except ValueError as ve:
            # Якщо виникла помилка з параметром швидкості, спробуємо без нього
            logger.warning(f"Помилка з параметром швидкості: {str(ve)}, спробуємо без нього")
            communicate = edge_tts.Communicate(
                request.text,
                request.voice
            )
            
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            
            if not audio_data:
                raise Exception("Не вдалося синтезувати аудіо навіть без параметра швидкості")
                
            return Response(content=audio_data, media_type="audio/mpeg")
    
    except Exception as e:
        logger.error(f"Помилка при синтезі мовлення: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return Response(
            content=str(e),
            media_type="text/plain",
            status_code=500
        )

# Запускаємо сервер
if __name__ == "__main__":
    import uvicorn
    
    logger.info("Запуск TTS сервера на http://0.0.0.0:3000")
    uvicorn.run(app, host="0.0.0.0", port=3000)