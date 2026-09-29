"""Idempotent MySQL setup for RizPOS."""

import asyncio
from datetime import datetime, timezone

from mysql_store import MySQLDatabase

MIGRATION_VERSION = 2

DEFAULT_SETTINGS = {
    "id": "store",
    "name": "RizPOS",
    "tagline": "Point of Sale System",
    "address": "",
    "phone": "",
    "email": "",
    "logo_url": "",
    "receipt_footer": "Terima kasih atas kunjungan Anda!",
    "payment_methods": [{
        "id": "cash", "label": "Tunai", "kind": "cash", "channel": None,
        "icon": "wallet", "color": "#10B981", "enabled": True, "sort": 1,
    }],
    "display_welcome": "Selamat Datang",
    "display_bg_color": "#0F1115",
    "display_accent_color": "#F97316",
    "display_card_color": "#161920",
    "display_text_color": "#FFFFFF",
}


async def run_migrations(db: MySQLDatabase) -> int:
    await db.ensure_schema()
    if not await db.settings.find_one({"id": "store"}):
        await db.settings.insert_one(DEFAULT_SETTINGS)
    if not await db.schema_migrations.find_one({"version": MIGRATION_VERSION}):
        await db.schema_migrations.insert_one({
            "id": f"migration-{MIGRATION_VERSION}",
            "version": MIGRATION_VERSION,
            "name": "mysql_json_document_store",
            "applied_at": datetime.now(timezone.utc).isoformat(),
        })
    return MIGRATION_VERSION


async def main():
    db = MySQLDatabase()
    try:
        version = await run_migrations(db)
        print(f"RizPOS MySQL database ready: {db.database_name} (schema v{version})")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
