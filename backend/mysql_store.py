"""Small async document adapter backed by MySQL JSON.

It keeps the existing endpoint code stable while RizPOS uses MySQL. Each
logical collection is stored in the `rizpos_documents` table.
This is a temporary compatibility layer; relational tables can be introduced
later without changing the API contract.
"""

import json
import os
import re
import uuid
import asyncio
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional

import aiomysql


def _env(name: str, fallback: str) -> str:
    return os.getenv(name, fallback).strip().strip('"').strip("'")


@dataclass
class WriteResult:
    matched_count: int = 0
    modified_count: int = 0
    deleted_count: int = 0
    inserted_id: Optional[str] = None


def _get_value(doc: dict, path: str) -> Any:
    value: Any = doc
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def _matches(doc: dict, query: dict) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, item) for item in expected):
                return False
            continue
        actual = _get_value(doc, key)
        if isinstance(expected, dict) and any(str(k).startswith("$") for k in expected):
            for operator, target in expected.items():
                if operator == "$ne" and actual == target:
                    return False
                if operator == "$in" and actual not in target:
                    return False
                if operator == "$nin" and actual in target:
                    return False
                if operator == "$gte" and (actual is None or actual < target):
                    return False
                if operator == "$gt" and (actual is None or actual <= target):
                    return False
                if operator == "$lte" and (actual is None or actual > target):
                    return False
                if operator == "$lt" and (actual is None or actual >= target):
                    return False
                if operator == "$regex":
                    flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                    if actual is None or re.search(target, str(actual), flags) is None:
                        return False
            continue
        if actual != expected:
            return False
    return True


def _project(doc: dict, projection: Optional[dict]) -> dict:
    result = deepcopy(doc)
    if not projection:
        return result
    excluded = {key for key, value in projection.items() if value == 0}
    included = {key for key, value in projection.items() if value == 1}
    if included:
        result = {key: _get_value(doc, key) for key in included if _get_value(doc, key) is not None}
    for key in excluded:
        result.pop(key, None)
    return result


def _set_path(doc: dict, path: str, value: Any) -> None:
    parts = path.split(".")
    target = doc
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = value


def _apply_update(doc: dict, update: dict) -> dict:
    result = deepcopy(doc)
    if not any(key.startswith("$") for key in update):
        return deepcopy(update)
    for key, values in update.get("$set", {}).items():
        _set_path(result, key, values)
    for key, values in update.get("$inc", {}).items():
        _set_path(result, key, (_get_value(result, key) or 0) + values)
    for key in update.get("$unset", {}):
        result.pop(key, None)
    return result


class Cursor:
    def __init__(self, loader):
        self.loader = loader
        self.docs = None
        self.sort_fields = []
        self.limit_value = None

    async def _load(self):
        if self.docs is None:
            self.docs = await self.loader()
        for field, direction in reversed(self.sort_fields):
            self.docs.sort(key=lambda item: (_get_value(item, field) is None, _get_value(item, field)), reverse=direction < 0)
        if self.limit_value is not None:
            self.docs = self.docs[:self.limit_value]
        return self.docs

    def sort(self, field: str, direction: int):
        self.sort_fields.append((field, direction))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    async def to_list(self, length: int):
        return (await self._load())[:length]

    def __aiter__(self) -> AsyncIterator[dict]:
        async def iterator():
            for doc in await self._load():
                yield doc
        return iterator()


class Collection:
    def __init__(self, database: "MySQLDatabase", name: str):
        self.database = database
        self.name = name
        # Document updates are read/modify/write operations. Serialize them
        # per collection so a cashier cart sync cannot overwrite a payment
        # intent written by the customer display at the same time.
        # Collection objects are created on every ``db.<collection>`` access.
        # The lock must therefore live on the database, otherwise concurrent
        # requests receive different locks and can still clobber JSON state.
        self._write_lock = database._write_locks.setdefault(name, asyncio.Lock())

    async def _all(self) -> List[dict]:
        await self.database.ensure_schema()
        async with self.database.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT document FROM rizpos_documents WHERE collection=%s", (self.name,))
                rows = await cur.fetchall()
                # The pool uses autocommit=False. End the read transaction
                # before returning the connection; otherwise a long-lived
                # backend worker can keep an old InnoDB snapshot and miss a
                # payment status written by another request/process.
                await conn.rollback()
        return [json.loads(row["document"]) if isinstance(row["document"], str) else row["document"] for row in rows]

    async def find_one(self, query=None, projection=None):
        for doc in await self._all():
            if _matches(doc, query or {}):
                return _project(doc, projection)
        return None

    def find(self, query=None, projection=None):
        async def load():
            return [_project(doc, projection) for doc in await self._all() if _matches(doc, query or {})]
        return Cursor(load)

    async def insert_one(self, document: dict):
        doc = deepcopy(document)
        doc.setdefault("id", str(uuid.uuid4()))
        await self.database.ensure_schema()
        async with self.database.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO rizpos_documents(collection, doc_id, document) VALUES (%s,%s,%s)",
                    (self.name, doc["id"], json.dumps(doc, default=str)),
                )
            await conn.commit()
        return WriteResult(inserted_id=doc["id"])

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        return await self._update(query, update, upsert, many=False)

    async def update_many(self, query: dict, update: dict):
        return await self._update(query, update, False, many=True)

    async def _update(self, query, update, upsert, many):
        async with self._write_lock:
            docs = await self._all()
            matches = [doc for doc in docs if _matches(doc, query)]
            if not matches and upsert:
                base = {key: value for key, value in query.items() if not key.startswith("$") and not isinstance(value, dict)}
                base.setdefault("id", str(uuid.uuid4()))
                new_doc = _apply_update(base, update)
                await self.insert_one(new_doc)
                return WriteResult(inserted_id=new_doc["id"])
            selected = matches if many else matches[:1]
            for doc in selected:
                changed = _apply_update(doc, update)
                await self._replace(doc, changed)
            return WriteResult(matched_count=len(selected), modified_count=len(selected))

    async def _replace(self, old: dict, new: dict):
        await self.database.ensure_schema()
        doc_id = old.get("id") or old.get("_id")
        new.setdefault("id", doc_id)
        async with self.database.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE rizpos_documents SET document=%s, updated_at=CURRENT_TIMESTAMP WHERE collection=%s AND doc_id=%s",
                    (json.dumps(new, default=str), self.name, doc_id),
                )
            await conn.commit()

    async def delete_one(self, query: dict):
        doc = await self.find_one(query)
        if not doc:
            return WriteResult()
        doc_id = doc.get("id") or doc.get("_id")
        async with self.database.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM rizpos_documents WHERE collection=%s AND doc_id=%s", (self.name, doc_id))
            await conn.commit()
        return WriteResult(deleted_count=1)

    async def count_documents(self, query: dict):
        return sum(1 for doc in await self._all() if _matches(doc, query or {}))

    async def create_index(self, *args, **kwargs):
        return kwargs.get("name", args[0] if args else "index")

    def aggregate(self, pipeline: list):
        async def load():
            return await self._aggregate(pipeline)
        return Cursor(load)

    async def _aggregate(self, pipeline: list):
        docs = await self._all()
        for stage in pipeline:
            if "$unwind" in stage:
                field = stage["$unwind"].lstrip("$")
                expanded = []
                for doc in docs:
                    for item in doc.get(field, []):
                        copy = deepcopy(doc)
                        copy[field] = item
                        expanded.append(copy)
                docs = expanded
            elif "$group" in stage:
                spec = stage["$group"]
                grouped = {}
                for doc in docs:
                    group_id = _get_value(doc, spec["_id"].lstrip("$")) if isinstance(spec["_id"], str) else spec["_id"]
                    row = grouped.setdefault(group_id, {"_id": group_id})
                    for key, expr in spec.items():
                        if key == "_id":
                            continue
                        if "$first" in expr:
                            row.setdefault(key, _get_value(doc, expr["$first"].lstrip("$")))
                        elif "$sum" in expr:
                            row[key] = row.get(key, 0) + (_get_value(doc, expr["$sum"].lstrip("$")) or 0)
                docs = list(grouped.values())
            elif "$sort" in stage:
                for field, direction in reversed(list(stage["$sort"].items())):
                    docs.sort(key=lambda item: item.get(field), reverse=direction < 0)
            elif "$limit" in stage:
                docs = docs[:stage["$limit"]]
        return docs


class MySQLDatabase:
    def __init__(self):
        self.host = _env("MYSQL_HOST", "127.0.0.1")
        self.port = int(_env("MYSQL_PORT", "3306"))
        self.user = _env("MYSQL_USER", "root")
        self.password = _env("MYSQL_PASSWORD", "")
        self.database_name = _env("MYSQL_DATABASE", os.getenv("DB_NAME", "rizposweb"))
        self.pool = None
        self._schema_ready = False
        self._write_locks = {}

    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return Collection(self, name)

    async def ensure_schema(self):
        if self.pool is None:
            bootstrap = await aiomysql.create_pool(host=self.host, port=self.port, user=self.user, password=self.password, autocommit=True)
            async with bootstrap.acquire() as conn:
                async with conn.cursor() as cur:
                    safe_name = self.database_name.replace("`", "``")
                    await cur.execute(f"CREATE DATABASE IF NOT EXISTS `{safe_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            bootstrap.close()
            await bootstrap.wait_closed()
            self.pool = await aiomysql.create_pool(host=self.host, port=self.port, user=self.user, password=self.password, db=self.database_name, autocommit=False)
        if not self._schema_ready:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""CREATE TABLE IF NOT EXISTS rizpos_documents (
                        collection VARCHAR(64) NOT NULL,
                        doc_id VARCHAR(255) NOT NULL,
                        document JSON NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        PRIMARY KEY (collection, doc_id),
                        INDEX idx_collection (collection),
                        INDEX idx_updated_at (updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
                await conn.commit()
            self._schema_ready = True

    async def close(self):
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
