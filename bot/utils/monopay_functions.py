import asyncio
import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from utils.time_utils import now_kyiv

import requests
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from config import DATABASE_PATH, MARZBAN_PASS, MARZBAN_URL, MARZBAN_USER, MINI_APP_URL, REFERRAL_PERCENT, SUBSCRIPTION_PRICES, XTOKEN, administrators
from utils.marzban import MarzbanAPI


def _get_marzban() -> MarzbanAPI | None:
    if not MARZBAN_URL or not MARZBAN_USER or not MARZBAN_PASS:
        return None
    return MarzbanAPI(MARZBAN_URL, MARZBAN_USER, MARZBAN_PASS)


logger = logging.getLogger(__name__)

MONO_API_HOST = 'https://api.monobank.ua'
RECURRING_MAX_FAILS = 3
RECURRING_RETRY_HOURS = 12
EXPIRING_REMINDER_DAYS = (3, 1, 0)
UA_MONTHS_GENITIVE = (
    'січня',
    'лютого',
    'березня',
    'квітня',
    'травня',
    'червня',
    'липня',
    'серпня',
    'вересня',
    'жовтня',
    'листопада',
    'грудня',
)


@dataclass
class RecurringSubscription:
    id: int
    user_id: int
    wallet_id: str
    card_token: str
    months: int
    price: float
    next_payment_date: str
    fail_count: int
    status: str
    masked_card: str | None
    card_type: str | None


def _db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _iso(dt: datetime | None = None) -> str:
    return (dt or now_kyiv()).isoformat()


def _format_date_ua_long(value: datetime | str | None) -> str:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = _parse_iso(value) if isinstance(value, str) else None
    if not dt:
        return '—'
    return f'{dt.day} {UA_MONTHS_GENITIVE[dt.month - 1]} {dt.year} року'


def _next_cycle_date(base_end_date: str | None, months: int) -> str:
    now = now_kyiv()
    base = _parse_iso(base_end_date) or now
    start = base if base > now else now
    result = datetime(start.year, start.month, start.day, start.hour, start.minute, start.second)
    result = result.replace(microsecond=0)
    result_month = result.month - 1 + months
    result_year = result.year + result_month // 12
    month = result_month % 12 + 1
    day = min(result.day, [31, 29 if result_year % 4 == 0 and (result_year % 100 != 0 or result_year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    result = result.replace(year=result_year, month=month, day=day)
    return _iso(result)


def _is_paid_status(status: str) -> bool:
    normalized = (status or '').strip().lower()
    return normalized in {'success', 'paid'}


def _is_failed_status(status: str) -> bool:
    normalized = (status or '').strip().lower()
    return normalized in {'failure', 'failed', 'expired', 'cancelled', 'reversed', 'declined'}


def _is_token_error(text: str) -> bool:
    lowered = (text or '').lower()
    markers = ('cardtoken', 'wallet', 'token', 'forbidden', 'invalid')
    return any(marker in lowered for marker in markers)


def _price_by_months(months: int) -> float:
    return float(SUBSCRIPTION_PRICES.get(months, 0.0))


async def _notify_user(
    user_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    from main import bot

    try:
        await bot.send_message(user_id, text, parse_mode='HTML', reply_markup=reply_markup)
    except Exception:
        logger.exception('Failed to notify user %s', user_id)


def _build_mini_app_url(user_id: int) -> str:
    if not MINI_APP_URL:
        return ''
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


def _mini_app_reply_markup(user_id: int) -> InlineKeyboardMarkup | None:
    mini_app_url = _build_mini_app_url(user_id)
    if not mini_app_url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text='🚀 Відкрити Mini App', url=mini_app_url)],
        ]
    )


async def _notify_admins(
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    from main import bot

    for admin_id in administrators:
        try:
            await bot.send_message(admin_id, text, parse_mode='HTML', reply_markup=reply_markup)
        except Exception:
            logger.exception('Failed to notify admin %s', admin_id)


def _admin_user_markup(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text='👤 Переглянути профіль', url=f'tg://user?id={user_id}')],
        ]
    )


class PaymentManager:
    def __init__(self) -> None:
        self.token = (XTOKEN or '').strip()
        self.host = MONO_API_HOST

    def _request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None, params: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.token:
            raise RuntimeError('XTOKEN is not configured')
        headers = {'X-Token': self.token, 'Content-Type': 'application/json'}
        response = requests.request(
            method=method,
            url=f'{self.host}{path}',
            headers=headers,
            json=json_body,
            params=params,
            timeout=25,
        )
        if response.status_code != 200:
            raise RuntimeError(f'Mono request failed: {response.status_code} {response.text}')
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError('Mono response is not an object')
        return data

    def get_payment_status(self, invoice_id: str) -> dict[str, Any]:
        return self._request('GET', '/api/merchant/invoice/status', params={'invoiceId': invoice_id})

    def get_wallet_cards(self, wallet_id: str) -> list[dict[str, Any]]:
        data = self._request('GET', f'/api/merchant/wallet/{wallet_id}/cards')
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        return []

    def create_token_payment(self, wallet_id: str, card_token: str, product_name: str, months: int, price: float) -> tuple[str, str]:
        local_payment_id = f'token_{wallet_id}_{int(now_kyiv().timestamp())}'
        payload = {
            'cardToken': card_token,
            'amount': int(round(price * 100)),
            'ccy': 980,
            'initiationKind': 'merchant',
            'paymentType': 'debit',
            'merchantPaymInfo': {
                'reference': local_payment_id,
                'destination': f'Автосписання {product_name} на {months} міс.',
                'basketOrder': [
                    {
                        'name': product_name,
                        'qty': 1,
                        'sum': int(round(price * 100)),
                        'code': f'auto_{months}m',
                        'unit': 'шт.',
                    }
                ],
            },
        }
        data = self._request('POST', '/api/merchant/wallet/payment', json_body=payload)
        invoice_id = str(data.get('invoiceId') or '')
        if not invoice_id:
            raise RuntimeError('Mono response missing invoiceId')
        return local_payment_id, invoice_id


def _extract_card_token(status_payload: dict[str, Any], wallet_id: str | None, payment_manager: PaymentManager) -> tuple[str | None, str | None, str | None]:
    wallet_data = status_payload.get('walletData')
    if isinstance(wallet_data, dict):
        token = wallet_data.get('cardToken')
        if isinstance(token, str) and token.strip():
            return token.strip(), wallet_data.get('maskedPan'), wallet_data.get('paymentSystem')
        if not wallet_id:
            wallet_id_val = wallet_data.get('walletId')
            if isinstance(wallet_id_val, str) and wallet_id_val.strip():
                wallet_id = wallet_id_val.strip()

    if wallet_id:
        cards = payment_manager.get_wallet_cards(wallet_id)
        if cards:
            last = cards[-1]
            token = str(last.get('cardToken') or last.get('token') or '').strip()
            if token:
                return token, last.get('maskedPan'), last.get('paymentSystem')
    return None, None, None


def _load_pending_subscription_payments(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT id, user_id, invoice_id, months, price, mode, status, wallet_id
        FROM payments
        WHERE mode = 'recurring' AND LOWER(COALESCE(status, 'created')) = 'created'
        ORDER BY id ASC
        """,
    ).fetchall()


def _load_due_recurring_subscriptions(conn: sqlite3.Connection) -> list[RecurringSubscription]:
    rows = conn.execute(
        """
        SELECT id, user_id, wallet_id, card_token, months, price, next_payment_date,
               fail_count, status, masked_card, card_type
        FROM recurring_subscriptions
        WHERE status = 'active'
        ORDER BY next_payment_date ASC, id ASC
        """,
    ).fetchall()
    due: list[RecurringSubscription] = []
    now = now_kyiv()
    for row in rows:
        next_dt = _parse_iso(row['next_payment_date'])
        if next_dt and next_dt <= now:
            due.append(
                RecurringSubscription(
                    id=int(row['id']),
                    user_id=int(row['user_id']),
                    wallet_id=str(row['wallet_id'] or ''),
                    card_token=str(row['card_token'] or ''),
                    months=int(row['months'] or 1),
                    price=float(row['price'] or 0),
                    next_payment_date=str(row['next_payment_date']),
                    fail_count=int(row['fail_count'] or 0),
                    status=str(row['status'] or 'active'),
                    masked_card=row['masked_card'],
                    card_type=row['card_type'],
                )
            )
    return due


def _insert_payment(conn: sqlite3.Connection, *, user_id: int, local_payment_id: str, invoice_id: str, wallet_id: str | None, months: int, price: float, mode: str, status: str, last_error: str | None = None) -> None:
    conn.execute(
        """
        INSERT INTO payments (user_id, local_payment_id, invoice_id, wallet_id, months, price, mode, status, created_at, updated_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            local_payment_id,
            invoice_id,
            wallet_id,
            months,
            price,
            mode,
            status,
            _iso(),
            _iso(),
            last_error,
        ),
    )


def _update_payment_status(conn: sqlite3.Connection, payment_id: int, status: str, *, last_error: str | None = None) -> None:
    conn.execute(
        """
        UPDATE payments
        SET status = ?, updated_at = ?, last_error = ?
        WHERE id = ?
        """,
        (status, _iso(), last_error, payment_id),
    )


def _upsert_recurring_subscription(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    wallet_id: str,
    card_token: str,
    months: int,
    price: float,
    next_payment_date: str,
    masked_card: str | None,
    card_type: str | None,
) -> None:
    now_iso = _iso()
    conn.execute(
        """
        INSERT INTO recurring_subscriptions (
            user_id, wallet_id, card_token, masked_card, card_type,
            months, price, next_payment_date, fail_count, status, last_error, created_at, updated_at, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', NULL, ?, ?, NULL)
        ON CONFLICT(user_id) DO UPDATE SET
            wallet_id=excluded.wallet_id,
            card_token=excluded.card_token,
            masked_card=excluded.masked_card,
            card_type=excluded.card_type,
            months=excluded.months,
            price=excluded.price,
            next_payment_date=excluded.next_payment_date,
            fail_count=0,
            status='active',
            last_error=NULL,
            updated_at=excluded.updated_at,
            cancelled_at=NULL
        """,
        (
            user_id,
            wallet_id,
            card_token,
            masked_card,
            card_type,
            months,
            price,
            next_payment_date,
            now_iso,
            now_iso,
        ),
    )
    conn.execute(
        """
        INSERT INTO subscriptions (
            user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
            recurring_cancelled_at, created_at, updated_at
        ) VALUES (?, NULL, NULL, 'inactive', 1, ?, NULL, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            recurring_enabled = 1,
            recurring_wallet_id = excluded.recurring_wallet_id,
            recurring_cancelled_at = NULL,
            updated_at = excluded.updated_at
        """,
        (user_id, wallet_id, now_iso, now_iso),
    )


def _hard_deactivate_subscription(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    recurring_cancelled_at: str | None = None,
) -> None:
    cancelled_at = recurring_cancelled_at or _iso()
    conn.execute(
        """
        INSERT INTO subscriptions (
            user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
            recurring_cancelled_at, created_at, updated_at
        ) VALUES (?, NULL, NULL, 'inactive', 0, NULL, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            status = 'inactive',
            recurring_enabled = 0,
            recurring_wallet_id = NULL,
            recurring_cancelled_at = ?,
            updated_at = excluded.updated_at
        """,
        (user_id, cancelled_at, _iso(), _iso(), cancelled_at),
    )


async def check_pending_payments() -> None:
    payment_manager = PaymentManager()
    conn = _db_connect()
    try:
        pending = _load_pending_subscription_payments(conn)
        for payment in pending:
            payment_id = int(payment['id'])
            user_id = int(payment['user_id'])
            invoice_id = str(payment['invoice_id'])
            months = int(payment['months'] or 1)
            amount = float(payment['price'] or _price_by_months(months))
            wallet_id = str(payment['wallet_id'] or '').strip() or None

            try:
                status_data = payment_manager.get_payment_status(invoice_id)
                status = str(status_data.get('status') or '').lower()
            except Exception as err:
                logger.exception('Failed to fetch status for %s', invoice_id)
                _update_payment_status(conn, payment_id, 'error', last_error=str(err))
                conn.commit()
                continue

            if _is_paid_status(status):
                _update_payment_status(conn, payment_id, 'paid', last_error=None)
                token, masked_card, card_type = _extract_card_token(status_data, wallet_id, payment_manager)
                resolved_wallet_id = wallet_id or str((status_data.get('walletData') or {}).get('walletId') or '')
                subscription_end_row = conn.execute(
                    "SELECT end_date FROM subscriptions WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                next_payment_date = _next_cycle_date(
                    subscription_end_row['end_date'] if subscription_end_row else None,
                    months,
                )

                if token and resolved_wallet_id:
                    _upsert_recurring_subscription(
                        conn,
                        user_id=user_id,
                        wallet_id=resolved_wallet_id,
                        card_token=token,
                        months=months,
                        price=amount,
                        next_payment_date=next_payment_date,
                        masked_card=masked_card if isinstance(masked_card, str) else None,
                        card_type=card_type if isinstance(card_type, str) else None,
                    )
                    conn.commit()
                    sub_end_row = conn.execute(
                        "SELECT end_date FROM subscriptions WHERE user_id = ?", (user_id,)
                    ).fetchone()
                    sub_end_date = sub_end_row['end_date'] if sub_end_row else None
                    await _notify_user(
                        user_id,
                        "✅ <b>Автосписання активовано</b>\n\n"
                        + (f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(sub_end_date)}</b>\n" if sub_end_date else "")
                        + f"🔄 Наступний платіж: <b>{_format_date_ua_long(next_payment_date)}</b>",
                    )
                    await _notify_admins(
                        "📌 <b>Recurring активовано</b>\n"
                        f"User: <code>{user_id}</code>\n"
                        f"Invoice: <code>{invoice_id}</code>\n"
                        f"Токен: <code>{token}</code>\n"
                        f"Наступний платіж: <b>{_format_date_ua_long(next_payment_date)}</b>",
                        reply_markup=_admin_user_markup(user_id),
                    )
                else:
                    conn.commit()
                    await _notify_admins(
                        "⚠️ <b>Оплата успішна, але токен картки не знайдено</b>\n"
                        f"User: <code>{user_id}</code>\nInvoice: <code>{invoice_id}</code>",
                        reply_markup=_admin_user_markup(user_id),
                    )
            elif _is_failed_status(status):
                _update_payment_status(conn, payment_id, status, last_error='Initial subscription payment failed')
                conn.commit()
                await _notify_admins(
                    "❌ <b>Платіж підписки не пройшов</b>\n"
                    f"User: <code>{user_id}</code>\nInvoice: <code>{invoice_id}</code>\nStatus: <b>{status}</b>",
                    reply_markup=_admin_user_markup(user_id),
                )
            else:
                logger.info('Payment %s still pending (%s)', invoice_id, status)
    finally:
        conn.close()


async def process_recurring_payments() -> None:
    payment_manager = PaymentManager()
    conn = _db_connect()
    try:
        due_subscriptions = _load_due_recurring_subscriptions(conn)
        for sub in due_subscriptions:
            if not sub.card_token or not sub.wallet_id:
                conn.execute(
                    """
                    UPDATE recurring_subscriptions
                    SET status = 'token_invalid',
                        cancelled_at = ?,
                        updated_at = ?,
                        last_error = ?
                    WHERE id = ?
                    """,
                    (_iso(), _iso(), 'Missing wallet/card token', sub.id),
                )
                conn.execute(
                    """
                    INSERT INTO subscriptions (
                        user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
                        recurring_cancelled_at, created_at, updated_at
                    ) VALUES (?, NULL, NULL, 'inactive', 0, NULL, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        recurring_enabled = 0,
                        recurring_cancelled_at = excluded.recurring_cancelled_at,
                        updated_at = excluded.updated_at
                    """,
                    (sub.user_id, _iso(), _iso(), _iso()),
                )
                conn.commit()
                _no_token_end_row = conn.execute(
                    "SELECT end_date FROM subscriptions WHERE user_id = ?", (sub.user_id,)
                ).fetchone()
                _no_token_end = _no_token_end_row['end_date'] if _no_token_end_row else None
                await _notify_user(
                    sub.user_id,
                    "⚠️ <b>Автоподовження скасовано</b>\n\n"
                    "Не вдалося знайти дані вашої картки для автосписання.\n"
                    + (f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(_no_token_end)}</b>\n\n" if _no_token_end else "\n")
                    + "Будь ласка, оновіть підписку вручну в Mini App.",
                    reply_markup=_mini_app_reply_markup(sub.user_id),
                )
                await _notify_admins(
                    "⚠️ <b>Recurring: токен картки відсутній</b>\n"
                    f"User ID: <code>{sub.user_id}</code>\n"
                    "Підписку не деактивовано — автосписання просто вимкнено.",
                    reply_markup=_admin_user_markup(sub.user_id),
                )
                continue

            try:
                local_payment_id, invoice_id = payment_manager.create_token_payment(
                    sub.wallet_id,
                    sub.card_token,
                    'Flix VPN',
                    sub.months,
                    sub.price,
                )
            except Exception as err:
                fail_count = sub.fail_count + 1
                last_error = str(err)
                should_cancel = fail_count >= RECURRING_MAX_FAILS or _is_token_error(last_error)
                if should_cancel:
                    conn.execute(
                        """
                        UPDATE recurring_subscriptions
                        SET fail_count = ?, status = 'cancelled', cancelled_at = ?, updated_at = ?, last_error = ?, card_token = NULL
                        WHERE id = ?
                        """,
                        (fail_count, _iso(), _iso(), last_error, sub.id),
                    )
                    _hard_deactivate_subscription(conn, user_id=sub.user_id, recurring_cancelled_at=_iso())
                    try:
                        marzban = _get_marzban()
                        if marzban:
                            marzban.disable_all_user_devices(sub.user_id, conn)
                    except Exception:
                        logger.exception('Marzban disable_all_user_devices failed for user %s', sub.user_id)
                    conn.commit()
                    await _notify_user(
                        sub.user_id,
                        "❌ <b>Підписку скасовано</b>\n\n"
                        "Кілька спроб автосписання не пройшли — доступ до VPN вимкнено.\n"
                        "Щоб відновити — оформіть нову підписку в Mini App.",
                        reply_markup=_mini_app_reply_markup(sub.user_id),
                    )
                    await _notify_admins(
                        "🛑 <b>Recurring скасовано (помилка створення платежу)</b>\n"
                        f"User ID: <code>{sub.user_id}</code>\n"
                        f"Токен: <code>{sub.card_token or '—'}</code>\n"
                        f"Спроб: {fail_count}/{RECURRING_MAX_FAILS}\n"
                        f"Причина: <code>{last_error[:200]}</code>",
                        reply_markup=_admin_user_markup(sub.user_id),
                    )
                else:
                    retry_at = now_kyiv() + timedelta(hours=RECURRING_RETRY_HOURS)
                    conn.execute(
                        """
                        UPDATE recurring_subscriptions
                        SET fail_count = ?, next_payment_date = ?, updated_at = ?, last_error = ?
                        WHERE id = ?
                        """,
                        (fail_count, _iso(retry_at), _iso(), last_error, sub.id),
                    )
                    conn.commit()
                    _retry1_end_row = conn.execute(
                        "SELECT end_date FROM subscriptions WHERE user_id = ?", (sub.user_id,)
                    ).fetchone()
                    _retry1_end = _retry1_end_row['end_date'] if _retry1_end_row else None
                    await _notify_user(
                        sub.user_id,
                        "⚠️ <b>Не вдалося провести автосписання</b>\n\n"
                        + (f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(_retry1_end)}</b>\n\n" if _retry1_end else "\n")
                        + "Переконайтеся, що на картці є кошти, щоб ми не скасували підписку.",
                    )
                    await _notify_admins(
                        "⚠️ <b>Recurring: помилка створення платежу</b>\n"
                        f"User ID: <code>{sub.user_id}</code>\n"
                        f"Токен: <code>{sub.card_token or '—'}</code>\n"
                        f"Спроба: {fail_count}/{RECURRING_MAX_FAILS}\n"
                        f"Наступна спроба: {_format_date_ua_long(retry_at)}\n"
                        f"Причина: <code>{last_error[:200]}</code>",
                        reply_markup=_admin_user_markup(sub.user_id),
                    )
                continue

            _insert_payment(
                conn,
                user_id=sub.user_id,
                local_payment_id=local_payment_id,
                invoice_id=invoice_id,
                wallet_id=sub.wallet_id,
                months=sub.months,
                price=sub.price,
                mode='recurring_charge',
                status='created',
            )
            conn.commit()

            # Poll payment status with retries — Mono may return 'processing' for a few seconds
            STATUS_RETRIES = 5
            STATUS_DELAYS = [3, 5, 8, 12, 15]
            status = 'processing'
            status_data: dict[str, Any] = {'status': 'processing'}
            for attempt in range(1, STATUS_RETRIES + 1):
                try:
                    status_data = payment_manager.get_payment_status(invoice_id)
                    status = str(status_data.get('status') or '').lower()
                    logger.info(
                        'Recurring charge status for user %s, invoice %s (attempt %d/%d): %s',
                        sub.user_id, invoice_id, attempt, STATUS_RETRIES, status,
                    )
                except Exception as err:
                    status = 'error'
                    status_data = {'status': 'error'}
                    logger.exception(
                        'Failed to check recurring payment status for user %s (attempt %d)',
                        sub.user_id, attempt,
                    )
                    conn.execute(
                        "UPDATE payments SET status = ?, updated_at = ?, last_error = ? WHERE invoice_id = ?",
                        ('error', _iso(), str(err), invoice_id),
                    )
                    conn.commit()
                    break

                if _is_paid_status(status) or _is_failed_status(status):
                    break

                if attempt < STATUS_RETRIES:
                    await asyncio.sleep(STATUS_DELAYS[attempt - 1])

            conn.execute(
                "UPDATE payments SET status = ?, updated_at = ? WHERE invoice_id = ?",
                (status, _iso(), invoice_id),
            )
            conn.commit()

            if _is_paid_status(status):
                conn.execute(
                    "UPDATE payments SET status = 'paid', updated_at = ?, last_error = NULL WHERE invoice_id = ?",
                    (_iso(), invoice_id),
                )
                current_end_row = conn.execute(
                    "SELECT end_date FROM subscriptions WHERE user_id = ?",
                    (sub.user_id,),
                ).fetchone()
                next_end_date = _next_cycle_date(current_end_row['end_date'] if current_end_row else None, sub.months)
                next_charge_date = _next_cycle_date(next_end_date, sub.months)
                conn.execute(
                    """
                    INSERT INTO subscriptions (
                        user_id, months, end_date, status, recurring_enabled, recurring_wallet_id,
                        recurring_cancelled_at, created_at, updated_at
                    ) VALUES (?, ?, ?, 'active', 1, ?, NULL, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        months = excluded.months,
                        end_date = excluded.end_date,
                        status = 'active',
                        recurring_enabled = 1,
                        recurring_wallet_id = excluded.recurring_wallet_id,
                        recurring_cancelled_at = NULL,
                        updated_at = excluded.updated_at
                    """,
                    (sub.user_id, sub.months, next_end_date, sub.wallet_id, _iso(), _iso()),
                )
                conn.execute(
                    """
                    UPDATE recurring_subscriptions
                    SET fail_count = 0,
                        next_payment_date = ?,
                        updated_at = ?,
                        status = 'active',
                        last_error = NULL
                    WHERE id = ?
                    """,
                    (next_charge_date, _iso(), sub.id),
                )
                conn.commit()

                try:
                    marzban = _get_marzban()
                    if marzban:
                        marzban.extend_all_user_devices(sub.user_id, conn, new_expire_ts=int(
                            datetime.fromisoformat(next_end_date).timestamp()
                        ))
                except Exception:
                    logger.exception('Marzban extend_all_user_devices failed for user %s', sub.user_id)

                await _notify_user(
                    sub.user_id,
                    "✅ <b>Підписку успішно продовжено</b>\n\n"
                    f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(next_end_date)}</b>\n\n"
                    f"💰 Сума: <b>{sub.price:.2f} грн</b>\n"
                    f"🔄 Наступне списання: <b>{_format_date_ua_long(next_charge_date)}</b>",
                )
                await _notify_admins(
                    "✅ <b>Recurring: списання успішне</b>\n"
                    f"User ID: <code>{sub.user_id}</code>\n"
                    f"Токен: <code>{sub.card_token}</code>\n"
                    f"Сума: <b>{sub.price:.2f} грн</b>\n"
                    f"Invoice: <code>{invoice_id}</code>\n"
                    f"Активна до: {_format_date_ua_long(next_end_date)}",
                    reply_markup=_admin_user_markup(sub.user_id),
                )
            else:
                fail_count = sub.fail_count + 1
                error_text = str(status_data.get('failureReason') or status_data.get('errText') or status or 'unknown_error')
                conn.execute(
                    "UPDATE payments SET status = ?, updated_at = ?, last_error = ? WHERE invoice_id = ?",
                    (status or 'failed', _iso(), error_text, invoice_id),
                )
                should_cancel = fail_count >= RECURRING_MAX_FAILS or _is_token_error(error_text)
                if should_cancel:
                    conn.execute(
                        """
                        UPDATE recurring_subscriptions
                        SET fail_count = ?, status = 'cancelled', cancelled_at = ?, updated_at = ?, last_error = ?
                        WHERE id = ?
                        """,
                        (fail_count, _iso(), _iso(), error_text, sub.id),
                    )
                    _hard_deactivate_subscription(conn, user_id=sub.user_id, recurring_cancelled_at=_iso())
                    try:
                        marzban = _get_marzban()
                        if marzban:
                            marzban.disable_all_user_devices(sub.user_id, conn)
                    except Exception:
                        logger.exception('Marzban disable_all_user_devices failed for user %s', sub.user_id)
                    conn.commit()
                    await _notify_user(
                        sub.user_id,
                        "❌ <b>Підписку скасовано</b>\n\n"
                        "Кілька спроб автосписання не пройшли — доступ до VPN вимкнено.\n"
                        "Щоб відновити — оформіть нову підписку в Mini App.",
                        reply_markup=_mini_app_reply_markup(sub.user_id),
                    )
                    await _notify_admins(
                        "🛑 <b>Recurring скасовано (невдалі списання)</b>\n"
                        f"User ID: <code>{sub.user_id}</code>\n"
                        f"Токен: <code>{sub.card_token or '—'}</code>\n"
                        f"Спроб: {fail_count}/{RECURRING_MAX_FAILS}\n"
                        f"Причина: <code>{error_text[:200]}</code>",
                        reply_markup=_admin_user_markup(sub.user_id),
                    )
                else:
                    retry_at = now_kyiv() + timedelta(hours=RECURRING_RETRY_HOURS)
                    conn.execute(
                        """
                        UPDATE recurring_subscriptions
                        SET fail_count = ?, next_payment_date = ?, updated_at = ?, last_error = ?
                        WHERE id = ?
                        """,
                        (fail_count, _iso(retry_at), _iso(), error_text, sub.id),
                    )
                    conn.commit()
                    _retry2_end_row = conn.execute(
                        "SELECT end_date FROM subscriptions WHERE user_id = ?", (sub.user_id,)
                    ).fetchone()
                    _retry2_end = _retry2_end_row['end_date'] if _retry2_end_row else None
                    await _notify_user(
                        sub.user_id,
                        "⚠️ <b>Не вдалося провести автосписання</b>\n\n"
                        + (f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(_retry2_end)}</b>\n\n" if _retry2_end else "\n")
                        + "Переконайтеся, що на картці є кошти, щоб ми не скасували підписку.",
                    )
                    await _notify_admins(
                        "⚠️ <b>Recurring: невдале списання</b>\n"
                        f"User ID: <code>{sub.user_id}</code>\n"
                        f"Токен: <code>{sub.card_token or '—'}</code>\n"
                        f"Спроба: {fail_count}/{RECURRING_MAX_FAILS}\n"
                        f"Наступна спроба: {_format_date_ua_long(retry_at)}\n"
                        f"Причина: <code>{error_text[:200]}</code>",
                        reply_markup=_admin_user_markup(sub.user_id),
                    )
    finally:
        conn.close()


async def check_expiring_subscriptions() -> None:
    conn = _db_connect()
    try:
        now = now_kyiv()
        rows = conn.execute(
            """
            SELECT user_id, end_date AS subscription_end_date, COALESCE(recurring_enabled, 0) AS recurring_enabled
            FROM subscriptions
            WHERE LOWER(COALESCE(status, '')) = 'active'
            """
        ).fetchall()

        for row in rows:
            user_id = int(row['user_id'])
            end_date = _parse_iso(row['subscription_end_date'])
            if not end_date:
                continue
            end_day = end_date.date()
            now_day = now.date()
            if end_day < now_day:
                continue

            days_left = (end_day - now_day).days
            if days_left not in EXPIRING_REMINDER_DAYS:
                continue

            recurring_enabled = bool(row['recurring_enabled'])
            access_line = f"🔓 Ви можете користуватися Flix VPN до <b>{_format_date_ua_long(end_date)}</b>\n\n"
            if days_left == 0:
                if recurring_enabled:
                    text = (
                        "🚨 <b>Останній день поточного періоду!</b>\n\n"
                        + access_line
                        + "Автосписання (для 1-місячного тарифу) спрацює автоматично.\n"
                        "Будь ласка, перевірте, щоб на картці було достатньо коштів."
                    )
                else:
                    text = (
                        "⏰ <b>Підписка завершується сьогодні</b>\n\n"
                        + access_line
                        + "Щоб не втратити доступ до VPN, продовжіть підписку в Mini App.\n"
                        "Для тарифів 3/6/12 міс. продовження доступне вручну через кабінет."
                    )
            else:
                day_word = "день" if days_left == 1 else "дні"
                if recurring_enabled:
                    text = (
                        "🔔 <b>Нагадування про підписку</b>\n\n"
                        + access_line
                        + f"До завершення поточного періоду: <b>{days_left} {day_word}</b>\n"
                        "Автосписання активне для 1-місячного тарифу.\n"
                        "Будь ласка, переконайтеся, що на картці достатньо коштів."
                    )
                else:
                    text = (
                        "📣 <b>Нагадування про завершення підписки</b>\n\n"
                        + access_line
                        + f"До завершення: <b>{days_left} {day_word}</b>\n"
                        "Продовжіть підписку в Mini App, щоб доступ до VPN не перервався.\n"
                        "Для тарифів 3/6/12 міс. продовження доступне вручну через кабінет."
                    )
            await _notify_user(user_id, text, reply_markup=_mini_app_reply_markup(user_id))
        conn.commit()
    finally:
        conn.close()


async def check_expired_subscriptions() -> None:
    conn = _db_connect()
    try:
        now = now_kyiv()
        rows = conn.execute(
            """
            SELECT user_id, end_date
            FROM subscriptions
            WHERE LOWER(COALESCE(status, '')) = 'active'
            """
        ).fetchall()

        for row in rows:
            user_id = int(row['user_id'])
            end_date = _parse_iso(row['end_date'])
            if not end_date:
                continue
            if end_date > now:
                continue

            conn.execute(
                """
                UPDATE subscriptions
                SET status = 'inactive',
                    recurring_enabled = 0,
                    recurring_wallet_id = NULL,
                    recurring_cancelled_at = COALESCE(recurring_cancelled_at, ?),
                    updated_at = ?
                WHERE user_id = ?
                """,
                (_iso(), _iso(), user_id),
            )

            try:
                marzban = _get_marzban()
                if marzban:
                    marzban.disable_all_user_devices(user_id, conn)
            except Exception:
                logger.exception('Marzban disable_all_user_devices failed for user %s', user_id)

            text = (
                "🔒 <b>Підписка завершилася</b>\n\n"
                f"Ваш період дії завершився: <b>{_format_date_ua_long(end_date)}</b>\n"
                "Щоб відновити доступ до VPN — продовжіть підписку в Mini App."
            )
            await _notify_user(user_id, text, reply_markup=_mini_app_reply_markup(user_id))

        conn.commit()
    finally:
        conn.close()

