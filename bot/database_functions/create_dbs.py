import sys
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parents[1]
if str(BOT_DIR) not in sys.path:
    sys.path.insert(0, str(BOT_DIR))

from config import administrators
from database_functions.admin_db import create_admins_table, init_superadmin
from database_functions.client_db import create_table
from database_functions.links_db import create_table_links
from database_functions.subscriptions_db import create_subscriptions_tables


def create_dbs():
    create_table()
    create_table_links()
    create_admins_table()
    create_subscriptions_tables()

    if administrators:
        superadmin_id = administrators[0]
        init_superadmin(superadmin_id)


if __name__ == '__main__':
    create_dbs()

