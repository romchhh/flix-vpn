from aiogram import F, Router, types
from aiogram.types import FSInputFile
from main import bot
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from keyboards.client_keyboards import get_start_keyboard
from keyboards.admin_keyboards import admin_keyboard, get_stats_keyboard
from Content.texts import get_greeting_message
from utils.admin_functions import generate_database_export
from database_functions.admin_db import get_subscription_stats, get_subscription_users_page
from states.admin_states import StatisticsStates
from datetime import datetime
import os
import html
from utils.time_utils import now_kyiv


router = Router()
STATS_PAGE_SIZE = 8


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


def _format_stats_header(stats: dict, section: str, search_query: str) -> str:
    titles = {
        'users': '👥 Користувачі',
        'subscriptions': '💳 Користувачі з підписками',
        'active': '✅ Активні підписки',
    }
    active_title = titles.get(section, titles['users'])
    search_line = f"\n🔎 Фільтр: <code>{html.escape(search_query)}</code>\n" if search_query else ""
    return (
        "<b>📊 Зручна статистика Flix VPN</b>\n\n"
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
    return (
        f"{index}. <code>{user['user_id']}</code> | {username}\n"
        f"   Ім'я: {first_name}\n"
        f"   Статус: {status} | План: {months_label}\n"
        f"   До: {end_date}"
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