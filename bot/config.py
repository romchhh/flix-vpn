from os import getenv
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*args, **kwargs):
        return False

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATABASE_PATH = PROJECT_ROOT / "database" / "data.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

token = getenv('TOKEN')

raw_admins = (getenv('ADMINISTRATORS') or '').strip()
if raw_admins.startswith('[') and raw_admins.endswith(']'):
    raw_admins = raw_admins[1:-1]
administrators = [int(admin_id.strip()) for admin_id in raw_admins.split(',') if admin_id.strip()]
raw_telegram_group_id = (getenv('TELEGRAM_GROUP_ID') or '').strip()
try:
    TELEGRAM_GROUP_ID = int(raw_telegram_group_id) if raw_telegram_group_id else None
except ValueError:
    TELEGRAM_GROUP_ID = None

MINI_APP_URL = (getenv('MINI_APP_URL') or '').strip()
SUPPORT_TG_URL = (getenv('SUPPORT_TG_URL') or 'https://t.me/flixvpn_admin').strip()

REFERRAL_PERCENT = float(getenv('REFERRAL_PERCENT') or '10')
XTOKEN = (getenv('XTOKEN') or '').strip()

MARZBAN_URL = (getenv('MARZBAN_URL') or '').strip().rstrip('/')
MARZBAN_USER = (getenv('MARZBAN_USER') or '').strip()
MARZBAN_PASS = (getenv('MARZBAN_PASS') or '').strip()

# Subscription pricing configuration for bot-side logic.
SUBSCRIPTION_PRICES: dict[int, float] = {
    1: 99.0,
    3: 200.0,
    6: 350.0,
    12: 600.0,
}

