from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from config import MINI_APP_URL, SUPPORT_TG_URL

def _build_mini_app_url(user_id: int) -> str:
    parts = urlsplit(MINI_APP_URL)
    query_params = dict(parse_qsl(parts.query, keep_blank_values=True))
    query_params['user_id'] = str(user_id)
    return urlunsplit((
        parts.scheme,
        parts.netloc,
        parts.path,
        urlencode(query_params),
        parts.fragment,
    ))


def get_start_keyboard(user_id: int = 0) -> ReplyKeyboardMarkup:
    if MINI_APP_URL:
        vpn_btn = KeyboardButton(text="🔌 Підключити VPN", web_app=WebAppInfo(url=_build_mini_app_url(user_id)))
    else:
        vpn_btn = KeyboardButton(text="🔌 Підключити VPN")
    return ReplyKeyboardMarkup(
        keyboard=[
            [vpn_btn],
            [
                KeyboardButton(text="💬 Підтримка"),
                KeyboardButton(text="🤝 Партнерська програма"),
            ],
            [KeyboardButton(text="❓ FAQ")],
        ],
        resize_keyboard=True,
    )


def get_support_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text='💬 Написати в підтримку',
                    url=SUPPORT_TG_URL,
                )
            ],
        ],
    )


def get_referral_keyboard(bot_name: str, user_id: int) -> InlineKeyboardMarkup:
    share_text = (
        '🛡️ Flix VPN — безпечний та швидкий VPN сервіс.\nПідключайся за моїм посиланням:\n\n'
        f'https://t.me/{bot_name}?start={user_id}'
    )
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text='📤 Поділитися посиланням',
                    switch_inline_query=share_text,
                )
            ],
        ],
    )
