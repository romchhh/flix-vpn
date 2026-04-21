import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from config import token
from apscheduler.schedulers.asyncio import AsyncIOScheduler


logging.basicConfig(level=logging.INFO)


bot = Bot(token=token)
storage = MemoryStorage()
dp = Dispatcher(bot=bot, storage=storage)

scheduler = AsyncIOScheduler(timezone='Europe/Kyiv')
scheduler.start()


async def main():
    from handlers.client_handlers.client_handlers import router as client_router, on_startup, on_shutdown
    from handlers.admin_handlers.admin_handlers import router as admin_router
    from handlers.admin_handlers.mailing_handlers import router as mailing_router
    from handlers.admin_handlers.links_handlers import router as links_router
    from handlers.admin_handlers.admin_management_handlers import router as admin_management_router
    dp.include_router(client_router)
    dp.include_router(admin_router)
    dp.include_router(mailing_router)
    dp.include_router(links_router)
    dp.include_router(admin_management_router)
    
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    while True:
        try:
            await dp.start_polling(bot, skip_updates=True)
        except Exception as e:
            logging.error(f"Bot crashed with error: {e}", exc_info=True)
            await asyncio.sleep(5)

if __name__ == '__main__':
    while True:
        try:
            asyncio.run(main())
        except Exception as e:
            logging.error(f"Critical error: {e}", exc_info=True)
            asyncio.run(asyncio.sleep(5))