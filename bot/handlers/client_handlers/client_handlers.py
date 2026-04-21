from aiogram import F, Router, types
from aiogram.filters import CommandStart

from Content.texts import get_faq_text, get_greeting_message, get_referral_text
from database_functions.client_db import (
    add_user,
    check_user,
    get_referred_by,
    get_referral_count,
    get_user_balance,
    set_referred_by,
    update_user_activity,
)
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from keyboards.client_keyboards import (
    get_referral_keyboard,
    get_start_keyboard,
    get_support_keyboard,
)
from main import bot, scheduler
from config import MINI_APP_URL, REFERRAL_PERCENT
from utils.monopay_functions import (
    check_expired_subscriptions,
    check_expiring_subscriptions,
    process_recurring_payments,
)
from utils.client_functions import notify_referrer_about_signup

router = Router()





async def scheduler_jobs():
    scheduler.add_job(
        process_recurring_payments,
        "interval",
        hours=5,
        id="process_recurring_payments",
        replace_existing=True,
    )
    scheduler.add_job(
        check_expiring_subscriptions,
        "interval",
        hours=2,
        id="check_expiring_subscriptions",
        replace_existing=True,
    )




@router.message(CommandStart())
async def start_command(message: types.Message):
    user = message.from_user
    user_id = user.id
    username = user.username
    args = message.text.split()

    user_exists = check_user(user_id)

    ref_link = None
    referrer_from_start = None
    if len(args) > 1:
        payload = args[1]
        if payload.startswith('linktowatch_'):
            try:
                ref_link = int(payload.split('_')[1])
                if not user_exists:
                    increment_link_count(ref_link)
            except (ValueError, IndexError):
                pass
        elif payload.isdigit():
            rid = int(payload)
            if rid != user_id and check_user(rid):
                referrer_from_start = rid

    if not user_exists:
        add_user(
            user_id,
            username,
            user.first_name,
            user.last_name,
            user.language_code,
            ref_link,
            referred_by=referrer_from_start,
        )
        if referrer_from_start is not None:
            await notify_referrer_about_signup(referrer_from_start, user)
    elif referrer_from_start is not None:
        # Фіксуємо реферала для існуючого користувача тільки якщо ще не був встановлений.
        current_referrer = get_referred_by(user_id)
        if current_referrer is None:
            set_referred_by(user_id, referrer_from_start)
            await notify_referrer_about_signup(referrer_from_start, user)

    update_user_activity(user_id)

    start_keyboard = get_start_keyboard(user_id)

    await message.answer(
        get_greeting_message(),
        parse_mode='HTML',
        reply_markup=start_keyboard,
    )


@router.message(F.text == "💬 Підтримка")
async def support_handler(message: types.Message):
    await message.answer(
        '<b>Підтримка Flix VPN</b>\n\n'
        'Натисніть кнопку нижче, щоб написати нам у Telegram.',
        parse_mode='HTML',
        reply_markup=get_support_keyboard(),
    )


@router.message(F.text == "🤝 Партнерська програма")
async def partner_handler(message: types.Message):
    me = await message.bot.get_me()
    uid = message.from_user.id
    count = get_referral_count(uid)
    balance = get_user_balance(uid)
    await message.answer(
        get_referral_text(
            me.username or '',
            uid,
            count,
            balance,
            REFERRAL_PERCENT,
        ),
        parse_mode='HTML',
        reply_markup=get_referral_keyboard(me.username or '', uid),
    )


@router.message(F.text == "❓ FAQ")
async def faq_handler(message: types.Message):
    await message.answer(get_faq_text(), parse_mode='HTML')


@router.message(F.text == "🔌 Підключити VPN")
async def vpn_fallback_handler(message: types.Message):
    if MINI_APP_URL:
        return
    await message.answer(
        'Посилання на міні-застосунок не налаштоване.\n'
        'Додайте змінну <code>MINI_APP_URL</code> у файлі <code>.env</code> '
        '(URL вашого Web App) і перезапустіть бота.',
        parse_mode='HTML',
    )


async def on_startup(router):
    me = await bot.get_me()
    create_dbs()
    await scheduler_jobs()
    print(f'Bot: @{me.username} запущений!')


async def on_shutdown(router):
    me = await bot.get_me()
    print(f'Bot: @{me.username} зупинений!')
