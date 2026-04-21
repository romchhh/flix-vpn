import sqlite3

from config import DATABASE_PATH

conn = sqlite3.connect(DATABASE_PATH)
cursor = conn.cursor()


def create_subscriptions_tables():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC UNIQUE,
            months INTEGER,
            end_date TEXT,
            status TEXT DEFAULT 'inactive',
            recurring_enabled INTEGER DEFAULT 0,
            recurring_wallet_id TEXT,
            recurring_cancelled_at TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC,
            local_payment_id TEXT,
            invoice_id TEXT,
            wallet_id TEXT,
            months INTEGER,
            price REAL,
            mode TEXT,
            status TEXT,
            created_at TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_devices (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC,
            device_name TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT,
            marzban_username TEXT,
            subscription_url TEXT
        )
    ''')
    # Migrate existing table
    cursor.execute('PRAGMA table_info(user_devices)')
    device_columns = {row[1] for row in cursor.fetchall()}
    if 'marzban_username' not in device_columns:
        cursor.execute('ALTER TABLE user_devices ADD COLUMN marzban_username TEXT')
    if 'subscription_url' not in device_columns:
        cursor.execute('ALTER TABLE user_devices ADD COLUMN subscription_url TEXT')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS recurring_subscriptions (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC UNIQUE,
            wallet_id TEXT,
            card_token TEXT,
            masked_card TEXT,
            card_type TEXT,
            months INTEGER DEFAULT 1,
            price REAL,
            next_payment_date TEXT,
            fail_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            last_error TEXT,
            created_at TEXT,
            updated_at TEXT,
            cancelled_at TEXT
        )
    ''')
    cursor.execute('DROP TABLE IF EXISTS app_notifications')
    cursor.execute('DROP TABLE IF EXISTS subscription_notifications')
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_unique "
        "ON subscriptions(user_id)"
    )

    # Migrate legacy subscription fields from users table into subscriptions table.
    cursor.execute('PRAGMA table_info(users)')
    user_columns = {row[1] for row in cursor.fetchall()}
    legacy_subscription_columns = {
        'subscription_months',
        'subscription_end_date',
        'subscription_status',
        'recurring_enabled',
        'recurring_wallet_id',
        'recurring_cancelled_at',
        'join_date',
    }
    if legacy_subscription_columns.issubset(user_columns):
        cursor.execute(
            '''
            INSERT INTO subscriptions (
                user_id, months, end_date, status, recurring_enabled,
                recurring_wallet_id, recurring_cancelled_at, created_at, updated_at
            )
            SELECT
                u.user_id,
                u.subscription_months,
                u.subscription_end_date,
                COALESCE(u.subscription_status, 'inactive'),
                COALESCE(u.recurring_enabled, 0),
                u.recurring_wallet_id,
                u.recurring_cancelled_at,
                COALESCE(u.join_date, datetime('now')),
                datetime('now')
            FROM users u
            WHERE u.user_id IS NOT NULL
              AND (
                  u.subscription_months IS NOT NULL
                  OR u.subscription_end_date IS NOT NULL
                  OR COALESCE(u.subscription_status, 'inactive') != 'inactive'
                  OR COALESCE(u.recurring_enabled, 0) = 1
              )
              AND NOT EXISTS (
                  SELECT 1 FROM subscriptions s WHERE s.user_id = u.user_id
              )
            '''
        )
    cursor.execute('PRAGMA table_info(payments)')
    payment_columns = {row[1] for row in cursor.fetchall()}
    if 'last_error' not in payment_columns:
        cursor.execute('ALTER TABLE payments ADD COLUMN last_error TEXT')
    if 'updated_at' not in payment_columns:
        cursor.execute('ALTER TABLE payments ADD COLUMN updated_at TEXT')
    conn.commit()
