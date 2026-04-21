import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Any

import requests
from utils.time_utils import now_kyiv

logger = logging.getLogger(__name__)

MONTHS_TO_DAYS: dict[int, int] = {1: 30, 3: 91, 6: 182, 12: 365}


def device_marzban_username(user_id: int, device_db_id: int) -> str:
    """Unique Marzban username per device: flix{user_id}d{device_id}"""
    return f'flix{user_id}d{device_db_id}'


def _bytes_to_mb(b: int | None) -> float:
    if not b:
        return 0.0
    return round(b / 1_048_576, 1)


class MarzbanAPI:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self._base_url = base_url.rstrip('/')
        self._username = username
        self._password = password
        self._token: str | None = None

    def _fetch_token(self) -> str:
        resp = requests.post(
            f'{self._base_url}/api/admin/token',
            data={'username': self._username, 'password': self._password},
            timeout=15,
        )
        if resp.status_code != 200:
            raise RuntimeError(f'Marzban auth failed: {resp.status_code} {resp.text}')
        return resp.json()['access_token']

    def _headers(self) -> dict[str, str]:
        if not self._token:
            self._token = self._fetch_token()
        return {'Authorization': f'Bearer {self._token}', 'Content-Type': 'application/json'}

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        retry: bool = True,
    ) -> dict[str, Any] | None:
        url = f'{self._base_url}{path}'
        resp = requests.request(
            method, url, headers=self._headers(), json=json_body, timeout=20
        )
        if resp.status_code == 401 and retry:
            self._token = self._fetch_token()
            return self._request(method, path, json_body=json_body, retry=False)
        if resp.status_code == 404:
            return None
        if resp.status_code not in (200, 201):
            raise RuntimeError(f'Marzban {method} {path} → {resp.status_code}: {resp.text}')
        return resp.json() if resp.content else {}

    # ─── Per-device helpers ───────────────────────────────────────────────────

    def create_device_user(
        self, user_id: int, device_db_id: int, expire_timestamp: int, note: str | None = None
    ) -> dict[str, Any]:
        """Create a Marzban user for a specific device."""
        username = device_marzban_username(user_id, device_db_id)
        payload: dict[str, Any] = {
            'username': username,
            'proxies': {'vless': {}},
            'expire': expire_timestamp,
            'data_limit': 0,
            'data_limit_reset_strategy': 'no_reset',
        }
        if note:
            payload['note'] = note
        result = self._request('POST', '/api/user', json_body=payload)
        return result or {}

    def disable_device_user(self, user_id: int, device_db_id: int) -> None:
        """Disable (but don't delete) a device's Marzban user."""
        username = device_marzban_username(user_id, device_db_id)
        self._request('PUT', f'/api/user/{username}', json_body={'status': 'disabled'})

    def disable_by_name(self, marzban_username: str) -> None:
        self._request('PUT', f'/api/user/{marzban_username}', json_body={'status': 'disabled'})

    def extend_by_name(self, marzban_username: str, new_expire_ts: int, note: str | None = None) -> None:
        """Set a new expiry timestamp for a Marzban user."""
        payload: dict[str, Any] = {
            'expire': new_expire_ts,
            'status': 'active',
        }
        if note:
            payload['note'] = note
        self._request('PUT', f'/api/user/{marzban_username}', json_body=payload)

    def get_user_info(self, marzban_username: str) -> dict[str, Any] | None:
        return self._request('GET', f'/api/user/{marzban_username}')

    def get_device_sub_link(self, user_id: int, device_db_id: int) -> str:
        username = device_marzban_username(user_id, device_db_id)
        return f'happ://add/{self._base_url}/sub/{username}'

    # ─── Bulk operations ─────────────────────────────────────────────────────

    def extend_all_user_devices(
        self, user_id: int, conn: sqlite3.Connection, new_expire_ts: int
    ) -> None:
        """Extend all active device Marzban accounts for a user."""
        rows = conn.execute(
            """SELECT
                   d.id,
                   d.device_name,
                   d.marzban_username,
                   u.user_name,
                   u.user_first_name,
                   COALESCE(s.status, 'inactive') AS subscription_status,
                   s.months
               FROM user_devices d
               LEFT JOIN users u ON u.user_id = d.user_id
               LEFT JOIN subscriptions s ON s.user_id = d.user_id
               WHERE d.user_id = ? AND d.status = 'active' AND d.marzban_username IS NOT NULL""",
            (user_id,),
        ).fetchall()
        for row in rows:
            marzban_username = row['marzban_username'] if isinstance(row, dict) else row[2]
            if not marzban_username:
                continue
            try:
                device_id = row['id'] if isinstance(row, dict) else row[0]
                device_name = row['device_name'] if isinstance(row, dict) else row[1]
                user_name = row['user_name'] if isinstance(row, dict) else row[3]
                user_first_name = row['user_first_name'] if isinstance(row, dict) else row[4]
                subscription_status = row['subscription_status'] if isinstance(row, dict) else row[5]
                subscription_months = row['months'] if isinstance(row, dict) else row[6]
                new_end_date = datetime.fromtimestamp(new_expire_ts).isoformat()
                note = "\n".join([
                    "Flix VPN device account",
                    f"user_id: {user_id}",
                    f"username: @{user_name}" if user_name else "username: —",
                    f"name: {user_first_name or '—'}",
                    f"device_id: {device_id}",
                    f"device_name: {device_name or '—'}",
                    f"subscription_status: {subscription_status or 'inactive'}",
                    f"subscription_plan_months: {subscription_months if subscription_months is not None else '—'}",
                    f"subscription_end_date: {new_end_date}",
                    f"generated_at_kyiv: {now_kyiv().isoformat()}",
                ])
                self.extend_by_name(marzban_username, new_expire_ts, note=note)
            except Exception:
                logger.exception('Failed to extend Marzban device user %s', marzban_username)

    def disable_all_user_devices(self, user_id: int, conn: sqlite3.Connection) -> None:
        """Disable all active device Marzban accounts for a user."""
        rows = conn.execute(
            """SELECT marzban_username
               FROM user_devices
               WHERE user_id = ? AND status = 'active' AND marzban_username IS NOT NULL""",
            (user_id,),
        ).fetchall()
        for row in rows:
            marzban_username = row['marzban_username'] if isinstance(row, dict) else row[0]
            if not marzban_username:
                continue
            try:
                self.disable_by_name(marzban_username)
            except Exception:
                logger.exception('Failed to disable Marzban device user %s', marzban_username)
