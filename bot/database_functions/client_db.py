import sqlite3
from datetime import datetime

from config import DATABASE_PATH

conn = sqlite3.connect(DATABASE_PATH)
cursor = conn.cursor()


def _ensure_user_columns():
    cursor.execute('PRAGMA table_info(users)')
    columns = {row[1] for row in cursor.fetchall()}
    if 'referred_by' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN referred_by INTEGER')
        conn.commit()
    if 'balance' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0')
        conn.commit()
    if 'notifications_enabled' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1')
        conn.commit()
    if 'marzban_username' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN marzban_username TEXT')
        conn.commit()


def create_table():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC,
            user_name TEXT,
            user_first_name TEXT,
            user_last_name TEXT,
            user_phone TEXT,
            language TEXT,
            join_date TEXT,
            last_activity TEXT,
            ref_link INTEGER,
            referred_by INTEGER,
            balance REAL DEFAULT 0,
            notifications_enabled INTEGER DEFAULT 1,
            marzban_username TEXT
        )
    ''')
    conn.commit()
    _ensure_user_columns()


def add_user(
    user_id: str,
    user_name: str,
    user_first_name: str,
    user_last_name: str,
    language: str,
    ref_link: int = None,
    referred_by: int = None,
):
    cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    existing_user = cursor.fetchone()
    if existing_user is None:
        current_date = now_kyiv().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO users (
                user_id, user_name, user_first_name, user_last_name, language,
                join_date, last_activity, ref_link, referred_by, balance, notifications_enabled
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
            ''', (
                user_id, user_name, user_first_name, user_last_name, language,
                current_date, current_date, ref_link, referred_by,
            ))
        conn.commit()


def check_user(user_id: str):
    cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
    user = cursor.fetchone()
    if user:
        return True
    return False    


def update_user_activity(user_id: str):
    current_time = now_kyiv().strftime("%Y-%m-%d %H:%M")
    cursor.execute('''
        UPDATE users 
        SET last_activity = ? 
        WHERE user_id = ?
    ''', (current_time, user_id))
    conn.commit()


def get_user_id_by_username(username: str):
    cursor.execute("SELECT user_id FROM users WHERE user_name = ?", (username,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_username_by_user_id(user_id: str):
    cursor.execute("SELECT user_name FROM users WHERE user_id = ?", (user_id,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_referral_count(user_id: int) -> int:
    cursor.execute(
        'SELECT COUNT(*) FROM users WHERE referred_by = ?',
        (user_id,),
    )
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def get_user_balance(user_id: int) -> float:
    cursor.execute(
        'SELECT COALESCE(balance, 0) FROM users WHERE user_id = ?',
        (user_id,),
    )
    row = cursor.fetchone()
    return float(row[0]) if row and row[0] is not None else 0.0


def get_referred_by(user_id: int) -> int | None:
    cursor.execute(
        'SELECT referred_by FROM users WHERE user_id = ?',
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return int(row[0]) if row[0] is not None else None


def set_referred_by(user_id: int, referrer_id: int) -> None:
    cursor.execute(
        'UPDATE users SET referred_by = ? WHERE user_id = ?',
        (referrer_id, user_id),
    )
    conn.commit()


def get_notifications_enabled(user_id: int) -> bool:
    cursor.execute(
        'SELECT COALESCE(notifications_enabled, 1) FROM users WHERE user_id = ?',
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return True
    return bool(row[0])


def set_notifications_enabled(user_id: int, enabled: bool) -> None:
    cursor.execute(
        'UPDATE users SET notifications_enabled = ? WHERE user_id = ?',
        (1 if enabled else 0, user_id),
    )
    conn.commit()