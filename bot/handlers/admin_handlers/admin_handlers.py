from aiogram import F, Router, types
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup
from main import bot
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from keyboards.client_keyboards import get_start_keyboard
from keyboards.admin_keyboards import admin_keyboard, get_stats_keyboard
from Content.texts import get_greeting_message
from utils.admin_functions import generate_database_export
from database_functions.admin_db import (
    get_subscription_discount_percent,
    get_subscription_prices,
    get_subscription_stats,
    get_subscription_users_page,
    set_subscription_price,
    set_subscription_discount_percent,
)
from states.admin_states import DiscountStates, PriceStates, StatisticsStates
from datetime import datetime
import os
import html
from utils.time_utils import now_kyiv


router = Router()
STATS_PAGE_SIZE = 8


def get_discount_keyboard() -> InlineKeyboardMarkup:
    prices = get_subscription_prices()
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=f"1 міс. — {prices[1]:.2f} грн", callback_data="price_edit_1")],
            [InlineKeyboardButton(text=f"3 міс. — {prices[3]:.2f} грн", callback_data="price_edit_3")],
            [InlineKeyboardButton(text=f"6 міс. — {prices[6]:.2f} грн", callback_data="price_edit_6")],
            [InlineKeyboardButton(text=f"12 міс. — {prices[12]:.2f} грн", callback_data="price_edit_12")],
            [
                InlineKeyboardButton(text="10%", callback_data="discount_set_10"),
                InlineKeyboardButton(text="15%", callback_data="discount_set_15"),
                InlineKeyboardButton(text="20%", callback_data="discount_set_20"),
            ],
            [InlineKeyboardButton(text="❌ Прибрати знижку", callback_data="discount_set_0")],
            [InlineKeyboardButton(text="✏️ Ввести знижку вручну", callback_data="discount_set_custom")],
        ]
    )


def _discount_text() -> str:
    discount = get_subscription_discount_percent()
    prices = get_subscription_prices()
    sample = prices[1]
    discounted_sample = round(sample * (1 - discount / 100), 2)
    return (
        "<b>💰 Ціни та знижка</b>\n\n"
        "<b>Поточні ціни:</b>\n"
        f"• 1 міс.: <b>{prices[1]:.2f} грн</b>\n"
        f"• 3 міс.: <b>{prices[3]:.2f} грн</b>\n"
        f"• 6 міс.: <b>{prices[6]:.2f} грн</b>\n"
        f"• 12 міс.: <b>{prices[12]:.2f} грн</b>\n\n"
        f"Поточна знижка: <b>{discount:.0f}%</b>\n\n"
        f"Приклад для 1 міс.: <b>{sample:.2f}</b> → <b>{discounted_sample:.2f} грн</b>\n\n"
        "Застосовується до всіх тарифів (1/3/6/12 міс.) для нових оплат."
    )


@router.message(IsAdmin(), F.text.in_(["👨‍💻 Адмін панель", "Адмін панель 💻", "/admin"]))
async def admin_panel(message: types.Message):
    await message.answer("Вітаю в адмін панелі. Ось ваші доступні опції.", reply_markup=admin_keyboard())
    
    
@router.message(IsAdmin(), F.text.in_(["Головне меню"]))
async def my_parcel(message: types.Message, state: FSMContext):
    user = message.from_user
    user_id = message.from_user.id
    keyboard = get_start_keyboard(user_id)
    greeting_message = get_greeting_message()
    await message.answer(greeting_message, reply_markup=keyboard, parse_mode="HTML")
    
    
@router.message(IsAdmin(), F.text.in_(["Статистика"]))
async def statistic_handler(message: types.Message):
    await stateful_render_stats(message, state=None, section='users', page=1, search_query='')


@router.message(IsAdmin(), F.text.in_(["Ціни підписок", "Знижки"]))
async def discounts_handler(message: types.Message):
    await message.answer(
        _discount_text(),
        parse_mode='HTML',
        reply_markup=get_discount_keyboard(),
    )


@router.callback_query(IsAdmin(), F.data.startswith("discount_set_"))
async def discount_callback(callback: types.CallbackQuery, state: FSMContext):
    value = callback.data[len("discount_set_"):]
    if value == "custom":
        await state.set_state(DiscountStates.waiting_for_discount_percent)
        await callback.message.answer(
            "Введіть відсоток знижки від 0 до 90.\n"
            "Приклад: <code>12.5</code> або <code>20</code>.",
            parse_mode='HTML',
        )
        await callback.answer()
        return

    if not value.isdigit():
        await callback.answer("Некоректне значення", show_alert=True)
        return

    updated = set_subscription_discount_percent(float(value))
    await callback.message.edit_text(
        _discount_text() + f"\n\n✅ Оновлено: <b>{updated:.0f}%</b>",
        parse_mode='HTML',
        reply_markup=get_discount_keyboard(),
    )
    await callback.answer("Знижку оновлено")


@router.callback_query(IsAdmin(), F.data.startswith("price_edit_"))
async def price_edit_callback(callback: types.CallbackQuery, state: FSMContext):
    raw_months = callback.data[len("price_edit_"):]
    if not raw_months.isdigit():
        await callback.answer("Некоректний тариф", show_alert=True)
        return
    months = int(raw_months)
    if months not in (1, 3, 6, 12):
        await callback.answer("Некоректний тариф", show_alert=True)
        return
    prices = get_subscription_prices()
    await state.set_state(PriceStates.waiting_for_price_value)
    await state.update_data(price_edit_months=months)
    await callback.message.answer(
        f"Введіть нову ціну для тарифу <b>{months} міс.</b>\n"
        f"Поточна ціна: <b>{prices[months]:.2f} грн</b>\n\n"
        "Приклад: <code>249</code> або <code>249.99</code>",
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(IsAdmin(), DiscountStates.waiting_for_discount_percent)
async def discount_custom_input(message: types.Message, state: FSMContext):
    raw = (message.text or "").strip().replace(",", ".")
    try:
        value = float(raw)
    except ValueError:
        await message.answer("Вкажіть число від 0 до 90.")
        return

    if value < 0 or value > 90:
        await message.answer("Значення має бути в межах від 0 до 90.")
        return

    updated = set_subscription_discount_percent(value)
    await state.clear()
    await message.answer(
        _discount_text() + f"\n\n✅ Оновлено: <b>{updated:.2f}%</b>",
        parse_mode='HTML',
        reply_markup=get_discount_keyboard(),
    )


@router.message(IsAdmin(), PriceStates.waiting_for_price_value)
async def price_custom_input(message: types.Message, state: FSMContext):
    data = await state.get_data()
    months = int(data.get("price_edit_months") or 0)
    if months not in (1, 3, 6, 12):
        await state.clear()
        await message.answer("Не вдалося визначити тариф. Спробуйте ще раз через меню.")
        return
    raw = (message.text or "").strip().replace(",", ".")
    try:
        value = float(raw)
    except ValueError:
        await message.answer("Вкажіть коректну ціну числом.")
        return
    if value <= 0:
        await message.answer("Ціна має бути більшою за 0.")
        return
    updated = set_subscription_price(months, value)
    await state.clear()
    await message.answer(
        _discount_text() + f"\n\n✅ Ціну для <b>{months} міс.</b> оновлено до <b>{updated:.2f} грн</b>",
        parse_mode="HTML",
        reply_markup=get_discount_keyboard(),
    )


def _format_stats_header(stats: dict, section: str, search_query: str) -> str:
    titles = {
        'users': '👥 Користувачі',
        'subscriptions': '💳 Користувачі з підписками',
        'active': '✅ Активні підписки',
    }
    active_title = titles.get(section, titles['users'])
    search_line = f"\n🔎 Фільтр: <code>{html.escape(search_query)}</code>\n" if search_query else ""
    return (
        "<b>📊 Cтатистика Flix VPN</b>\n\n"
        f"• Всього користувачів: <b>{stats['total_users']}</b>\n"
        f"• З підписками: <b>{stats['users_with_subscription']}</b>\n"
        f"• Активні зараз: <b>{stats['active_subscriptions']}</b>\n"
        f"• Завершуються ≤ 7 днів: <b>{stats['expiring_soon']}</b>\n"
        f"• Успішні оплати: <b>{stats['successful_payments']}</b>\n"
        f"• Сума успішних оплат: <b>{stats['payments_total_amount']:.2f} грн</b>\n\n"
        f"<b>{active_title}</b>{search_line}"
    )


def _format_user_row(index: int, user: dict) -> str:
    username = f"@{user['username']}" if user.get('username') else '—'
    first_name = html.escape((user.get('first_name') or '—').strip() or '—')
    status_raw = (user.get('subscription_status') or 'inactive').lower()
    status = '✅ active' if status_raw == 'active' else '⚪ inactive'
    months = user.get('subscription_months')
    months_label = f"{months} міс." if months else '—'
    end_date = html.escape(user.get('subscription_end_date') or '—')
    recurring_enabled = bool(user.get('recurring_enabled'))
    recurring_card_token = user.get('recurring_card_token') if recurring_enabled else None
    token_line = (
        f"\n   Токен: <code>{html.escape(str(recurring_card_token))}</code>"
        if recurring_card_token
        else ("\n   Токен: <code>не знайдено</code>" if recurring_enabled else "")
    )
    return (
        f"{index}. <code>{user['user_id']}</code> | {username}\n"
        f"   Ім'я: {first_name}\n"
        f"   Статус: {status} | План: {months_label}\n"
        f"   До: {end_date}"
        f"{token_line}"
    )


def _build_stats_text(section: str, page: int, search_query: str):
    stats = get_subscription_stats()
    users, total = get_subscription_users_page(
        page=page,
        page_size=STATS_PAGE_SIZE,
        section=section,
        query=search_query,
    )
    total_pages = max(1, (total + STATS_PAGE_SIZE - 1) // STATS_PAGE_SIZE)
    safe_page = min(max(1, page), total_pages)
    if safe_page != page:
        users, total = get_subscription_users_page(
            page=safe_page,
            page_size=STATS_PAGE_SIZE,
            section=section,
            query=search_query,
        )

    header = _format_stats_header(stats, section, search_query)
    if not users:
        body = "Нічого не знайдено за поточними фільтрами."
    else:
        start_index = (safe_page - 1) * STATS_PAGE_SIZE + 1
        rows = [_format_user_row(start_index + idx, user) for idx, user in enumerate(users)]
        body = "\n\n".join(rows)
    footer = f"\n\nСторінка: <b>{safe_page}/{total_pages}</b> | Записів: <b>{total}</b>"
    return f"{header}\n\n{body}{footer}", safe_page, total_pages


async def stateful_render_stats(
    target: types.Message | types.CallbackQuery,
    state: FSMContext | None,
    section: str,
    page: int,
    search_query: str,
):
    text, safe_page, total_pages = _build_stats_text(section, page, search_query)
    keyboard = get_stats_keyboard(
        section=section,
        page=safe_page,
        has_prev=safe_page > 1,
        has_next=safe_page < total_pages,
        has_search=bool(search_query),
    )

    if isinstance(target, types.CallbackQuery):
        await target.message.edit_text(text, parse_mode='HTML', reply_markup=keyboard)
        await target.answer()
    else:
        await target.answer(text, parse_mode='HTML', reply_markup=keyboard)

    if state:
        await state.update_data(stats_section=section, stats_page=safe_page, stats_query=search_query)


@router.callback_query(IsAdmin(), F.data.startswith("stats_section_"))
async def stats_section_callback(callback: types.CallbackQuery, state: FSMContext):
    _, _, section, page_raw = callback.data.split('_', 3)
    page = int(page_raw) if page_raw.isdigit() else 1
    data = await state.get_data()
    search_query = str(data.get('stats_query') or '')
    await stateful_render_stats(callback, state, section=section, page=page, search_query=search_query)


@router.callback_query(IsAdmin(), F.data == "stats_search")
async def stats_search_callback(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(StatisticsStates.waiting_for_search_query)
    await callback.message.answer(
        "🔍 Введіть <b>user_id</b> або <b>@username</b> для пошуку в статистиці.\n"
        "Щоб скасувати, надішліть <code>скасувати</code>.",
        parse_mode='HTML',
    )
    await callback.answer()


@router.callback_query(IsAdmin(), F.data == "stats_clear_search")
async def stats_clear_search_callback(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    section = str(data.get('stats_section') or 'users')
    await state.update_data(stats_query='')
    await stateful_render_stats(callback, state, section=section, page=1, search_query='')


@router.callback_query(IsAdmin(), F.data == "stats_noop")
async def stats_noop_callback(callback: types.CallbackQuery):
    await callback.answer()


@router.message(IsAdmin(), StatisticsStates.waiting_for_search_query)
async def stats_search_message(message: types.Message, state: FSMContext):
    query = (message.text or '').strip()
    if query.lower() in {'скасувати', 'cancel'}:
        await state.clear()
        await message.answer("Пошук скасовано.", parse_mode='HTML')
        return
    data = await state.get_data()
    section = str(data.get('stats_section') or 'users')
    await state.clear()
    await stateful_render_stats(message, state, section=section, page=1, search_query=query)
  
        
@router.callback_query(IsAdmin(), F.data == "export_database")
async def export_database(callback: types.CallbackQuery):
    response_message = (
            "<b>ВИГРУЗКА БАЗИ ДАНИХ</b>\n\n"
            f"Зачекайте поки ми сформуємо ексель файл з базою даних"
        )
    await callback.message.answer(response_message, parse_mode="HTML")
    
    filename, users_count, links_count = generate_database_export()
    
    file = FSInputFile(filename)
    await bot.send_document(
        callback.message.chat.id, 
        document=file, 
        caption=f"📊 База даних експортована\n\n"
                f"👥 Користувачів: {users_count}\n"
                f"🔗 Посилань: {links_count}\n"
                f"📅 Дата: {now_kyiv().strftime('%d.%m.%Y %H:%M')}"
    )
    
    if os.path.exists(filename):
        os.remove(filename)