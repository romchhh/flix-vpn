from datetime import datetime
from zoneinfo import ZoneInfo

KYIV_TZ = ZoneInfo('Europe/Kyiv')


def now_kyiv() -> datetime:
    """Return current naive datetime in Kyiv timezone (Europe/Kyiv)."""
    return datetime.now(tz=KYIV_TZ).replace(tzinfo=None)
