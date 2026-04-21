from aiogram import types
from main import bot

async def notify_referrer_about_signup(
    referrer_id: int,
    invited_user: types.User,
) -> None:
    invited_name = invited_user.first_name or invited_user.username or f'ID {invited_user.id}'
    invited_tag = f"@{invited_user.username}" if invited_user.username else f"<code>{invited_user.id}</code>"
    text = (
        f'🎉 <b>Новий реферал {invited_tag} зареєструвався за вашим посиланням!</b>\n\n'
    )
    try:
        await bot.send_message(referrer_id, text, parse_mode='HTML')
    except Exception:
        pass