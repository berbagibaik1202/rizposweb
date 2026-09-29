from dotenv import load_dotenv
from pathlib import Path
import asyncio
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
# Older local setups in this workspace keep the development credentials in
# env.txt. Load it as a fallback so a restart does not silently drop gateway
# credentials when backend/.env has not been created yet.
load_dotenv(ROOT_DIR / 'env.txt', override=False)

import os
import logging
import uuid
import secrets
import string
import base64
import hmac
import hashlib
import httpx
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from mysql_store import MySQLDatabase

# ---------- Setup ----------
db = MySQLDatabase()

app = FastAPI(title="RizPOS API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12  # 12 hours

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rizpos")


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def sanitize_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "cashier"),
        "active": u.get("active", True),
        "created_at": u.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["admin", "cashier"] = "cashier"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class CategoryIn(BaseModel):
    name: str
    color: str = "#F97316"
    icon: str = "package"


class ProductIn(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = None
    category_id: Optional[str] = None
    price: float
    cost: float = 0
    stock: int = 0
    unit: str = "pcs"
    image_url: Optional[str] = None
    description: Optional[str] = None
    active: bool = True


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class CartItem(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int
    subtotal: float


class TransactionIn(BaseModel):
    items: List[CartItem]
    customer_id: Optional[str] = None
    payment_method: Literal["cash", "card", "qris", "midtrans", "tripay"]
    amount_paid: float
    discount: float = 0
    tax_rate: float = 0
    note: Optional[str] = None
    payment_ref: Optional[str] = None  # gateway reference (midtrans order_id / tripay reference)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "cashier"]] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class PaymentMethodCfg(BaseModel):
    id: str
    label: str
    kind: Literal["cash", "card", "qris_static", "midtrans", "tripay"]
    channel: Optional[str] = None
    icon: str = "wallet"
    color: str = "#F97316"
    enabled: bool = True
    sort: int = 0


DEFAULT_PAYMENT_METHODS = [
    {"id": "cash", "label": "Tunai", "kind": "cash", "channel": None, "icon": "wallet", "color": "#10B981", "enabled": True, "sort": 1},
    {"id": "card", "label": "Kartu Debit/Kredit", "kind": "card", "channel": None, "icon": "credit-card", "color": "#3B82F6", "enabled": True, "sort": 2},
    {"id": "qris_tripay", "label": "QRIS", "kind": "tripay", "channel": "QRIS", "icon": "qr-code", "color": "#EA580C", "enabled": True, "sort": 3},
    {"id": "briva_tripay", "label": "BRI Virtual Account", "kind": "tripay", "channel": "BRIVA", "icon": "building", "color": "#0066B3", "enabled": False, "sort": 4},
    {"id": "bcava_tripay", "label": "BCA Virtual Account", "kind": "tripay", "channel": "BCAVA", "icon": "building", "color": "#005BAA", "enabled": False, "sort": 5},
    {"id": "shopeepay_tripay", "label": "ShopeePay", "kind": "tripay", "channel": "SHOPEEPAY", "icon": "wallet", "color": "#EE4D2D", "enabled": False, "sort": 6},
    {"id": "midtrans_all", "label": "Bayar Online (Midtrans)", "kind": "midtrans", "channel": None, "icon": "credit-card", "color": "#0EA5E9", "enabled": False, "sort": 7},
]


class StoreSettings(BaseModel):
    name: str = "RizPOS"
    tagline: str = "Point of Sale System"
    address: str = ""
    phone: str = ""
    email: str = ""
    logo_url: str = ""
    receipt_footer: str = "Terima kasih atas kunjungan Anda!"
    # Receipt design
    paper_size: Literal["58mm", "80mm", "a4"] = "80mm"
    font_size: Literal["xs", "sm", "md", "lg"] = "sm"
    accent_color: str = "#F97316"
    show_logo: bool = True
    show_tagline: bool = True
    show_address: bool = True
    show_contact: bool = True
    show_cashier: bool = True
    show_customer: bool = True
    show_receipt_no: bool = True
    show_datetime: bool = True
    show_item_price: bool = True
    show_powered_by: bool = True
    header_note: str = ""
    footer_note: str = ""
    receipt_style: Literal["compact", "detailed"] = "detailed"
    # Payment methods (admin curated)
    payment_methods: List[PaymentMethodCfg] = Field(default_factory=lambda: [PaymentMethodCfg(**m) for m in DEFAULT_PAYMENT_METHODS])
    # Customer display theme
    display_bg_color: str = "#0F1115"
    display_accent_color: str = "#F97316"
    display_text_color: str = "#FFFFFF"
    display_card_color: str = "#161920"
    display_welcome: str = "Selamat Datang"


# ---------- Auth Endpoints ----------
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": new_id(),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(doc["id"], email, doc["role"])
    return {"user": sanitize_user(doc), "token": token}


@api_router.post("/auth/login")
async def login(body: LoginInput):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token(user["id"], user["email"], user["role"])
    return {"user": sanitize_user(user), "token": token}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return sanitize_user(user)


# ---------- Users (Admin) ----------
@api_router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api_router.post("/users")
async def create_user(body: RegisterInput, _: dict = Depends(require_admin)):
    return await register(body)


@api_router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "password"}
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.users.update_one({"id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------- Categories ----------
@api_router.get("/categories")
async def list_categories(_: dict = Depends(get_current_user)):
    return await db.categories.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/categories")
async def create_category(body: CategoryIn, _: dict = Depends(require_admin)):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, _: dict = Depends(require_admin)):
    res = await db.categories.update_one({"id": cid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/categories/{cid}")
async def delete_category(cid: str, _: dict = Depends(require_admin)):
    await db.categories.delete_one({"id": cid})
    await db.products.update_many({"category_id": cid}, {"$set": {"category_id": None}})
    return {"ok": True}


# ---------- Products ----------
@api_router.get("/products")
async def list_products(
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    filt: dict = {}
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
        ]
    if category_id:
        filt["category_id"] = category_id
    return await db.products.find(filt, {"_id": 0}).sort("name", 1).to_list(2000)


@api_router.post("/products")
async def create_product(body: ProductIn, _: dict = Depends(require_admin)):
    if await db.products.find_one({"sku": body.sku}):
        raise HTTPException(status_code=400, detail="SKU already exists")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/products/{pid}")
async def update_product(pid: str, body: ProductIn, _: dict = Depends(require_admin)):
    res = await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.post("/products/{pid}/stock")
async def adjust_stock(pid: str, delta: int, _: dict = Depends(require_admin)):
    p = await db.products.find_one({"id": pid})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    new_stock = max(0, p.get("stock", 0) + delta)
    await db.products.update_one({"id": pid}, {"$set": {"stock": new_stock}})
    return {"ok": True, "stock": new_stock}


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, _: dict = Depends(require_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# ---------- Customers ----------
@api_router.get("/customers")
async def list_customers(_: dict = Depends(get_current_user)):
    return await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)


@api_router.post("/customers")
async def create_customer(body: CustomerIn, _: dict = Depends(get_current_user)):
    doc = {"id": new_id(), **body.model_dump(), "total_spent": 0, "visits": 0, "created_at": now_iso()}
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, _: dict = Depends(get_current_user)):
    res = await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/customers/{cid}")
async def delete_customer(cid: str, _: dict = Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}


# ---------- Transactions ----------
def _generate_receipt_no() -> str:
    now = datetime.now(timezone.utc)
    return f"RZP-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


@api_router.post("/transactions")
async def create_transaction(body: TransactionIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    subtotal = sum(i.subtotal for i in body.items)
    tax_amount = round(subtotal * (body.tax_rate / 100.0), 2)
    total = round(subtotal - body.discount + tax_amount, 2)
    if body.amount_paid < total and body.payment_method == "cash":
        raise HTTPException(status_code=400, detail="Insufficient payment")

    change = round(body.amount_paid - total, 2) if body.payment_method == "cash" else 0

    # Deduct stock
    for it in body.items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"stock": -it.quantity}})

    doc = {
        "id": new_id(),
        "receipt_no": _generate_receipt_no(),
        "items": [i.model_dump() for i in body.items],
        "customer_id": body.customer_id,
        "cashier_id": user["id"],
        "cashier_name": user.get("name", user["email"]),
        "payment_method": body.payment_method,
        "payment_ref": body.payment_ref,
        "subtotal": subtotal,
        "discount": body.discount,
        "tax_rate": body.tax_rate,
        "tax_amount": tax_amount,
        "total": total,
        "amount_paid": body.amount_paid,
        "change": change,
        "note": body.note,
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(doc)

    if body.customer_id:
        await db.customers.update_one(
            {"id": body.customer_id},
            {"$inc": {"total_spent": total, "visits": 1}},
        )

    doc.pop("_id", None)
    return doc


@api_router.get("/transactions")
async def list_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    payment_method: Optional[str] = None,
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    filt: dict = {}
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        filt["created_at"] = rng
    if payment_method:
        filt["payment_method"] = payment_method
    return await db.transactions.find(filt, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@api_router.get("/transactions/{tid}")
async def get_transaction(tid: str, _: dict = Depends(get_current_user)):
    t = await db.transactions.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return t


# ---------- Reports & Dashboard ----------
@api_router.get("/reports/dashboard")
async def dashboard(_: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    txs_today = await db.transactions.find(
        {"created_at": {"$gte": today}}, {"_id": 0}
    ).to_list(5000)

    revenue_today = sum(t.get("total", 0) for t in txs_today)
    tx_count_today = len(txs_today)
    avg_ticket = round(revenue_today / tx_count_today, 2) if tx_count_today else 0

    # Sales trend last 7 days
    trend = []
    now = datetime.now(timezone.utc)
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        txs = await db.transactions.find(
            {"created_at": {"$gte": d, "$lt": d + "T99"}}, {"_id": 0}
        ).to_list(5000)
        trend.append({"date": d, "revenue": sum(t.get("total", 0) for t in txs), "count": len(txs)})

    # Top products (all-time top 5 by qty)
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "name": {"$first": "$items.name"},
            "qty": {"$sum": "$items.quantity"},
            "revenue": {"$sum": "$items.subtotal"},
        }},
        {"$sort": {"qty": -1}},
        {"$limit": 5},
    ]
    top_products = []
    async for row in db.transactions.aggregate(pipeline):
        top_products.append({
            "product_id": row["_id"],
            "name": row["name"],
            "qty": row["qty"],
            "revenue": row["revenue"],
        })

    low_stock = await db.products.find(
        {"stock": {"$lte": 5}}, {"_id": 0}
    ).limit(10).to_list(10)

    total_products = await db.products.count_documents({})
    total_customers = await db.customers.count_documents({})

    # Payment method split (today)
    pm_split: dict = {"cash": 0, "card": 0, "qris": 0}
    for t in txs_today:
        pm_split[t.get("payment_method", "cash")] = pm_split.get(t.get("payment_method", "cash"), 0) + t.get("total", 0)

    return {
        "revenue_today": revenue_today,
        "tx_count_today": tx_count_today,
        "avg_ticket": avg_ticket,
        "total_products": total_products,
        "total_customers": total_customers,
        "trend": trend,
        "top_products": top_products,
        "low_stock": low_stock,
        "payment_split": pm_split,
    }


@api_router.get("/reports/sales")
async def sales_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    filt: dict = {}
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T99"
        filt["created_at"] = rng

    txs = await db.transactions.find(filt, {"_id": 0}).to_list(5000)
    total_revenue = sum(t.get("total", 0) for t in txs)
    total_tx = len(txs)
    total_items = sum(sum(i["quantity"] for i in t.get("items", [])) for t in txs)

    # By category
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    p_cat_map = {p["id"]: p.get("category_id") for p in products}
    categories = await db.categories.find({}, {"_id": 0}).to_list(200)
    c_name_map = {c["id"]: c["name"] for c in categories}

    by_cat: dict = {}
    by_product: dict = {}
    for t in txs:
        for it in t.get("items", []):
            cat_id = p_cat_map.get(it["product_id"])
            cat_name = c_name_map.get(cat_id, "Tanpa Kategori")
            by_cat[cat_name] = by_cat.get(cat_name, 0) + it["subtotal"]
            by_product.setdefault(it["product_id"], {"name": it["name"], "qty": 0, "revenue": 0})
            by_product[it["product_id"]]["qty"] += it["quantity"]
            by_product[it["product_id"]]["revenue"] += it["subtotal"]

    return {
        "total_revenue": total_revenue,
        "total_tx": total_tx,
        "total_items": total_items,
        "by_category": [{"name": k, "revenue": v} for k, v in by_cat.items()],
        "by_product": sorted(by_product.values(), key=lambda x: x["revenue"], reverse=True)[:50],
        "transactions": txs[-100:],
    }


# ---------- Settings ----------
@api_router.get("/settings")
async def get_settings(_: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"id": "store"}, {"_id": 0})
    if not s:
        default = {"id": "store", **StoreSettings().model_dump()}
        await db.settings.insert_one(default)
        default.pop("_id", None)
        return default
    # Backfill new fields for older settings docs
    changed = False
    defaults = StoreSettings().model_dump()
    for k, v in defaults.items():
        if k not in s:
            s[k] = v
            changed = True
    if changed:
        await db.settings.update_one({"id": "store"}, {"$set": s})
    return s


@api_router.put("/settings")
async def update_settings(body: StoreSettings, _: dict = Depends(require_admin)):
    doc = {"id": "store", **body.model_dump()}
    await db.settings.update_one({"id": "store"}, {"$set": doc}, upsert=True)
    return doc


# ---------- Barcode lookup ----------
@api_router.get("/products/by-barcode/{code}")
async def by_barcode(code: str, _: dict = Depends(get_current_user)):
    p = await db.products.find_one(
        {"$or": [{"sku": code}, {"barcode": code}]}, {"_id": 0}
    )
    if not p:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return p


# ---------- Payment Gateways ----------
def _midtrans_base() -> str:
    mode = os.environ.get("MIDTRANS_MODE", "sandbox")
    return "https://app.midtrans.com" if mode == "production" else "https://app.sandbox.midtrans.com"


def _tripay_base() -> str:
    mode = os.environ.get("TRIPAY_MODE", "sandbox")
    return "https://tripay.co.id/api" if mode == "production" else "https://tripay.co.id/api-sandbox"


class GatewayChargeIn(BaseModel):
    items: List[CartItem]
    discount: float = 0
    tax_rate: float = 0
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    tripay_method: Optional[str] = None  # e.g. "QRIS", "BRIVA", "OVO", "DANA"


def _compute_total(items: List[CartItem], discount: float, tax_rate: float) -> tuple[int, int, int, int]:
    subtotal = int(sum(i.subtotal for i in items))
    tax_amount = int(round(subtotal * (tax_rate / 100.0)))
    total = int(subtotal - int(discount) + tax_amount)
    return subtotal, tax_amount, int(discount), total


@api_router.post("/payments/midtrans/charge")
async def midtrans_charge(body: GatewayChargeIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    server_key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not server_key:
        raise HTTPException(status_code=500, detail="Midtrans not configured")
    subtotal, tax_amount, disc, total = _compute_total(body.items, body.discount, body.tax_rate)
    order_id = f"RZP-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"

    item_details = [
        {"id": i.product_id, "name": i.name[:50], "price": int(i.price), "quantity": int(i.quantity)}
        for i in body.items
    ]
    if disc > 0:
        item_details.append({"id": "DISC", "name": "Diskon", "price": -disc, "quantity": 1})
    if tax_amount > 0:
        item_details.append({"id": "TAX", "name": f"Pajak {body.tax_rate}%", "price": tax_amount, "quantity": 1})

    payload = {
        "transaction_details": {"order_id": order_id, "gross_amount": total},
        "item_details": item_details,
        "customer_details": {
            "first_name": (body.customer_name or "Pelanggan")[:30],
            "email": body.customer_email or "guest@rizpos.id",
            "phone": body.customer_phone or "",
        },
        "credit_card": {"secure": True},
    }
    auth = base64.b64encode((server_key + ":").encode()).decode()
    url = f"{_midtrans_base()}/snap/v1/transactions"
    try:
        async with httpx.AsyncClient(timeout=20) as ac:
            r = await ac.post(url, json=payload, headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json", "Accept": "application/json"})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Midtrans: {r.text}")
        data = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Midtrans error: {e}")

    await db.payment_intents.insert_one({
        "id": new_id(),
        "gateway": "midtrans",
        "order_id": order_id,
        "amount": total,
        "status": "pending",
        "user_id": user["id"],
        "cart": [i.model_dump() for i in body.items],
        "discount": disc,
        "tax_rate": body.tax_rate,
        "customer_id": body.customer_id,
        "created_at": now_iso(),
        "raw": data,
    })
    return {
        "order_id": order_id,
        "token": data.get("token"),
        "redirect_url": data.get("redirect_url"),
        "client_key": os.environ.get("MIDTRANS_CLIENT_KEY", ""),
        "mode": os.environ.get("MIDTRANS_MODE", "sandbox"),
        "amount": total,
    }


@api_router.get("/payments/midtrans/status/{order_id}")
async def midtrans_status(order_id: str, _: dict = Depends(get_current_user)):
    server_key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    auth = base64.b64encode((server_key + ":").encode()).decode()
    base = "https://api.midtrans.com" if os.environ.get("MIDTRANS_MODE") == "production" else "https://api.sandbox.midtrans.com"
    async with httpx.AsyncClient(timeout=15) as ac:
        r = await ac.get(f"{base}/v2/{order_id}/status", headers={"Authorization": f"Basic {auth}", "Accept": "application/json"})
    data = r.json()
    ts = data.get("transaction_status")
    fraud = data.get("fraud_status", "")
    paid = ts in ("settlement", "capture") and fraud in ("", "accept")
    await db.payment_intents.update_one({"order_id": order_id}, {"$set": {"status": "paid" if paid else ts or "unknown", "checked_at": now_iso()}})
    return {"order_id": order_id, "transaction_status": ts, "paid": paid, "raw": data}


@api_router.post("/payments/tripay/charge")
async def tripay_charge(body: GatewayChargeIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    if not body.tripay_method:
        raise HTTPException(status_code=400, detail="tripay_method required (e.g. QRIS)")
    api_key = os.environ.get("TRIPAY_API_KEY", "")
    private_key = os.environ.get("TRIPAY_PRIVATE_KEY", "")
    merchant = os.environ.get("TRIPAY_MERCHANT_CODE", "")
    if not (api_key and private_key and merchant):
        raise HTTPException(status_code=500, detail="Tripay not configured")

    subtotal, tax_amount, disc, total = _compute_total(body.items, body.discount, body.tax_rate)
    merchant_ref = f"RZP{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}{uuid.uuid4().hex[:4].upper()}"
    sig_msg = f"{merchant}{merchant_ref}{total}"
    signature = hmac.new(private_key.encode(), sig_msg.encode(), hashlib.sha256).hexdigest()

    order_items = [{"sku": i.product_id[:24], "name": i.name[:50], "price": int(i.price), "quantity": int(i.quantity)} for i in body.items]

    payload = {
        "method": body.tripay_method,
        "merchant_ref": merchant_ref,
        "amount": total,
        "customer_name": body.customer_name or "Pelanggan",
        "customer_email": body.customer_email or "guest@rizpos.id",
        "customer_phone": body.customer_phone or "081234567890",
        "order_items": order_items,
        "expired_time": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
        "signature": signature,
    }
    callback_url = os.environ.get("TRIPAY_CALLBACK_URL", "").strip()
    if callback_url:
        payload["callback_url"] = callback_url

    url = f"{_tripay_base()}/transaction/create"
    async with httpx.AsyncClient(timeout=20) as ac:
        r = await ac.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"})
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Tripay: {r.text}")
    data = r.json()
    if not data.get("success"):
        raise HTTPException(status_code=400, detail=data.get("message", "Tripay failed"))
    d = data["data"]
    reference = d.get("reference")

    await db.payment_intents.insert_one({
        "id": new_id(),
        "gateway": "tripay",
        "order_id": reference,
        "merchant_ref": merchant_ref,
        "amount": total,
        "status": "pending",
        "user_id": user["id"],
        "cart": [i.model_dump() for i in body.items],
        "discount": disc,
        "tax_rate": body.tax_rate,
        "customer_id": body.customer_id,
        "method": body.tripay_method,
        "created_at": now_iso(),
        "raw": d,
    })
    return {
        "reference": reference,
        "merchant_ref": merchant_ref,
        "checkout_url": d.get("checkout_url"),
        "qr_url": d.get("qr_url"),
        "qr_string": d.get("qr_string"),
        "pay_code": d.get("pay_code"),
        "amount": total,
        "expired_time": d.get("expired_time"),
        "instructions": d.get("instructions", []),
    }


@api_router.get("/payments/tripay/status/{reference}")
async def tripay_status(reference: str, _: dict = Depends(get_current_user)):
    api_key = os.environ.get("TRIPAY_API_KEY", "")
    url = f"{_tripay_base()}/transaction/detail?reference={reference}"
    async with httpx.AsyncClient(timeout=15) as ac:
        r = await ac.get(url, headers={"Authorization": f"Bearer {api_key}"})
    data = r.json()
    status = data.get("data", {}).get("status")
    normalized_status = str(status or "").upper()
    paid = normalized_status in ("PAID", "SETTLED", "SUCCESS")
    await db.payment_intents.update_one({"order_id": reference}, {"$set": {"status": "paid" if paid else (status or "unknown").lower(), "checked_at": now_iso()}})
    return {"reference": reference, "status": status, "paid": paid, "raw": data.get("data")}


@api_router.post("/payments/tripay/callback")
async def tripay_callback(request: Request):
    """Receive Tripay payment_status callbacks and mark the display paid."""
    raw = await request.body()
    private_key = os.environ.get("TRIPAY_PRIVATE_KEY", "")
    expected = hmac.new(private_key.encode(), raw, hashlib.sha256).hexdigest()
    received = request.headers.get("X-Callback-Signature", "")
    if not private_key or not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=403, detail="Invalid callback signature")
    if request.headers.get("X-Callback-Event") != "payment_status":
        raise HTTPException(status_code=400, detail="Unsupported callback event")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid callback payload") from exc

    reference = str(data.get("reference") or "")
    merchant_ref = str(data.get("merchant_ref") or "")
    status = str(data.get("status") or "").upper()
    paid = status in ("PAID", "SETTLED", "SUCCESS")

    await db.payment_intents.update_many(
        {"$or": [{"order_id": reference}, {"merchant_ref": merchant_ref}]},
        {"$set": {"status": "paid" if paid else status.lower(), "checked_at": now_iso()}},
    )
    sessions = await db.display_sessions.find({}, {"_id": 0}).to_list(500)
    matched = 0
    if paid:
        for session in sessions:
            intent = session.get("payment_intent") or {}
            if (
                (reference and intent.get("reference") == reference)
                or (merchant_ref and intent.get("merchant_ref") == merchant_ref)
            ):
                await db.display_sessions.update_one(
                    {"code": session.get("code"), "status": {"$ne": "paid"}},
                    {"$set": {
                        "status": "paid",
                        "sync_version": int(session.get("sync_version") or 0) + 1,
                        "updated_at": now_iso(),
                    }},
                )
                matched += 1
    return {"success": True, "paid": paid, "matched_sessions": matched}


@api_router.get("/payments/tripay/channels")
async def tripay_channels(_: dict = Depends(get_current_user)):
    api_key = os.environ.get("TRIPAY_API_KEY", "")
    url = f"{_tripay_base()}/merchant/payment-channel"
    try:
        async with httpx.AsyncClient(timeout=15) as ac:
            r = await ac.get(url, headers={"Authorization": f"Bearer {api_key}"})
        return r.json().get("data", [])
    except Exception:
        return []


# ---------- Customer Display Sessions ----------
class DisplayUpdateIn(BaseModel):
    items: List[CartItem] = []
    discount: float = 0
    tax_rate: float = 0
    customer_name: Optional[str] = None
    status: Literal["idle", "checkout", "payment_selection", "awaiting_payment", "paid", "cancelled"] = "checkout"
    message: Optional[str] = None
    # Prevent an older debounced cashier request from overwriting a newer cart state.
    sync_version: Optional[int] = None
    # Explicitly clear the customer display when the cashier removes the cart.
    force_reset: bool = False
    # Explicit signal from the cashier that a new cart was started after the
    # previous transaction/payment flow finished.
    new_transaction: bool = False


class DisplaySelectMethodIn(BaseModel):
    method: Literal["cash", "card", "qris", "midtrans", "tripay"]
    tripay_channel: Optional[str] = None


def _new_display_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    # avoid confusing chars
    for c in ("0", "O", "1", "I"):
        alphabet = alphabet.replace(c, "")
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _public_display_view(s: Dict[str, Any]) -> Dict[str, Any]:
    subtotal = int(sum(i.get("subtotal", 0) for i in s.get("items", [])))
    tax_amount = int(round(subtotal * (float(s.get("tax_rate", 0)) / 100.0)))
    total = int(subtotal - int(s.get("discount", 0)) + tax_amount)
    return {
        "code": s["code"],
        "store": s.get("store", {}),
        "payment_methods": s.get("payment_methods", []),
        "items": s.get("items", []),
        "subtotal": subtotal,
        "discount": int(s.get("discount", 0)),
        "tax_rate": float(s.get("tax_rate", 0)),
        "tax_amount": tax_amount,
        "total": total,
        "customer_name": s.get("customer_name"),
        "status": s.get("status", "idle"),
        "message": s.get("message"),
        "selected_method": s.get("selected_method"),
        "selected_method_id": s.get("selected_method_id"),
        "payment_intent": s.get("payment_intent"),
        "updated_at": s.get("updated_at"),
        "sync_version": s.get("sync_version"),
    }


async def _active_display_session(code: str) -> Optional[Dict[str, Any]]:
    """Return an open display session using the MySQL-safe lookup path."""
    for attempt in range(3):
        sessions = await db.display_sessions.find({"code": code.upper()}, {"_id": 0}).to_list(100)
        active = next((item for item in sessions if item.get("closed") is not True), None)
        if active:
            return active
        if attempt < 2:
            await asyncio.sleep(0.05)
    return None


class DisplayPayIn(BaseModel):
    method_id: str


class DisplayIntentIn(BaseModel):
    method: Literal["midtrans", "tripay"]
    intent: Dict[str, Any]


@api_router.post("/display/public/{code}/cancel-payment")
async def cancel_display_payment(code: str):
    """Return to method selection without selecting cash as a side effect."""
    s = await _active_display_session(code)
    if not s:
        raise HTTPException(status_code=404, detail="Session tidak ditemukan")
    if s.get("status") not in ("awaiting_payment", "payment_selection"):
        return {"ok": True, "ignored": True}
    if (
        s.get("status") == "awaiting_payment"
        and (s.get("payment_intent") or {}).get("gateway") in ("tripay", "midtrans")
    ):
        return {"ok": True, "ignored": True, "reason": "gateway_payment_active"}
    result = await db.display_sessions.update_one(
        {"code": code.upper(), "status": {"$in": ["awaiting_payment", "payment_selection"]}},
        {"$set": {
            "status": "payment_selection",
            "selected_method": None,
            "selected_method_id": None,
            "payment_intent": None,
            "sync_version": int(s.get("sync_version") or 0) + 1,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": result.matched_count > 0}


class DisplayRequestPaymentIn(BaseModel):
    items: List[CartItem] = []
    discount: float = 0
    tax_rate: float = 0
    customer_name: Optional[str] = None


@api_router.post("/display/sessions")
async def create_display_session(user: dict = Depends(get_current_user)):
    # A new activation always starts a new session. Close every previous
    # session for this cashier so an old display window cannot remain active.
    await db.display_sessions.update_many(
        {"closed": {"$ne": True}},
        {"$set": {"closed": True, "status": "cancelled", "updated_at": now_iso()}},
    )

    # Snapshot store branding
    store = await db.settings.find_one({"id": "store"}, {"_id": 0}) or {}
    for _ in range(6):
        code = _new_display_code()
        if not await db.display_sessions.find_one({"code": code}):
            break
    doc = {
        "code": code,
        "cashier_id": user["id"],
        "cashier_name": user.get("name") or user.get("email"),
        "store": {k: store.get(k) for k in (
            "name", "tagline", "address", "phone", "email", "logo_url",
            "display_bg_color", "display_accent_color", "display_text_color",
            "display_card_color", "display_welcome",
        )},
        "payment_methods": [m for m in (store.get("payment_methods") or []) if m.get("enabled")],
        "items": [],
        "discount": 0,
        "tax_rate": 0,
        "customer_name": None,
        "status": "idle",
        "selected_method": None,
        "payment_intent": None,
        "closed": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.display_sessions.insert_one(doc)
    # Close any session that may have been inserted concurrently between the
    # initial cleanup and this insert. Keep only the session just created
    # active, otherwise two display windows can poll different transactions
    # and appear to flicker between them.
    await db.display_sessions.update_many(
        {"code": {"$ne": code}, "closed": {"$ne": True}},
        {"$set": {"closed": True, "status": "cancelled", "updated_at": now_iso()}},
    )
    return {"code": code}


@api_router.put("/display/sessions/{code}")
async def update_display_session(code: str, body: DisplayUpdateIn, user: dict = Depends(get_current_user)):
    s = await db.display_sessions.find_one({"code": code})
    if not s or s.get("closed"):
        raise HTTPException(status_code=404, detail="Session tidak aktif")
    if s["cashier_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan session Anda")
    current_version = int(s.get("sync_version") or 0)
    incoming_version = body.sync_version
    if incoming_version is not None and incoming_version < current_version:
        return {"ok": True, "ignored": True, "reason": "stale_sync"}
    incoming_items = [i.model_dump() for i in body.items]
    current_items = s.get("items") or []

    def cart_signature(items: List[Dict[str, Any]]) -> str:
        return json.dumps([
            {
                "product_id": i.get("product_id"),
                "quantity": i.get("quantity"),
                "price": i.get("price"),
                "subtotal": i.get("subtotal"),
            }
            for i in items
        ], sort_keys=True, separators=(",", ":"))

    is_new_cart = cart_signature(incoming_items) != cart_signature(current_items)
    # A delayed cart sync from before the cashier pressed Bayar must not move
    # an already active payment session back to the waiting/checkout screen.
    # A genuinely different, non-empty cart is a new transaction and must be
    # allowed to replace the completed/previous payment state.
    if (
        body.status in ("idle", "checkout", "payment_selection")
        and s.get("status") in ("payment_selection", "awaiting_payment", "paid")
        and not (body.status == "checkout" and incoming_items and body.new_transaction)
    ):
        return {"ok": True, "ignored": True, "reason": "payment_in_progress"}
    upd = {
        "items": incoming_items,
        "discount": body.discount,
        "tax_rate": body.tax_rate,
        "customer_name": body.customer_name,
        "status": body.status,
        "message": body.message,
        "updated_at": now_iso(),
    }
    if incoming_version is not None:
        upd["sync_version"] = incoming_version
    # Entering payment selection must preserve an intent that was just created
    # by the customer display or cashier. Only a normal checkout update clears
    # the previous payment attempt.
    if body.status == "checkout":
        upd["selected_method"] = None
        upd["selected_method_id"] = None
        upd["payment_intent"] = None
    update_query = {"code": code}
    # Re-check the payment state as part of the database update. The earlier
    # read can be stale while a customer click is creating a gateway intent;
    # a stale cashier snapshot must then match zero rows instead of restoring
    # payment_selection/checkout and deleting the new intent.
    if (
        body.status in ("idle", "checkout", "payment_selection")
        and not (body.status == "checkout" and body.new_transaction)
    ):
        update_query["status"] = {"$nin": ["awaiting_payment", "paid"]}
    result = await db.display_sessions.update_one(update_query, {"$set": upd})
    if result.matched_count == 0:
        return {"ok": True, "ignored": True, "reason": "payment_in_progress"}
    return {"ok": True}


@api_router.post("/display/sessions/{code}/close")
async def close_display_session(code: str, user: dict = Depends(get_current_user)):
    await db.display_sessions.update_one(
        {"code": code, "cashier_id": user["id"]},
        {"$set": {"closed": True, "status": "cancelled", "updated_at": now_iso()}},
    )
    return {"ok": True}


@api_router.post("/display/sessions/{code}/reset")
async def reset_display_session(code: str, user: dict = Depends(get_current_user)):
    """Return a paid customer display to its idle welcome screen."""
    s = await db.display_sessions.find_one({"code": code})
    if not s or s.get("closed"):
        raise HTTPException(status_code=404, detail="Session tidak aktif")
    if s["cashier_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan session Anda")
    # A delayed reset from the previous payment must never clear a new cart.
    if s.get("status") != "paid":
        return {"ok": True, "ignored": True, "reason": "session_has_new_transaction"}
    await db.display_sessions.update_one(
        {"code": code},
        {"$set": {
            "items": [], "discount": 0, "tax_rate": 0,
            "customer_name": None, "status": "idle",
            "selected_method": None, "selected_method_id": None,
            "payment_intent": None,
            "sync_version": int(s.get("sync_version") or 0) + 1,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


@api_router.post("/display/sessions/{code}/payment-intent")
async def publish_display_payment_intent(code: str, body: DisplayIntentIn, user: dict = Depends(get_current_user)):
    """Publish a gateway payment started by the cashier to the customer display."""
    s = await db.display_sessions.find_one({"code": code})
    if not s or s.get("closed"):
        raise HTTPException(status_code=404, detail="Session tidak aktif")
    if s["cashier_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan session Anda")
    intent = dict(body.intent)
    intent["gateway"] = body.method
    result = await db.display_sessions.update_one(
        {"code": code, "status": {"$nin": ["awaiting_payment", "paid"]}},
        {"$set": {
            "selected_method": body.method,
            "payment_intent": intent,
            "status": "awaiting_payment",
            "sync_version": int(s.get("sync_version") or 0) + 1,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


@api_router.post("/display/sessions/{code}/request-payment")
async def request_display_payment(code: str, body: DisplayRequestPaymentIn, user: dict = Depends(get_current_user)):
    """Move an active cart into payment selection from the cashier."""
    s = await db.display_sessions.find_one({"code": code})
    if not s or s.get("closed"):
        raise HTTPException(status_code=404, detail="Session tidak aktif")
    if s["cashier_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bukan session Anda")
    if not body.items and not s.get("items"):
        raise HTTPException(status_code=400, detail="Keranjang kosong")
    # The cashier request can arrive after the customer has already selected
    # QRIS (the two requests are independent). Never reset an active payment
    # intent back to payment_selection in that race.
    if (
        s.get("status") in ("awaiting_payment", "paid")
        or s.get("selected_method_id")
        or s.get("payment_intent")
    ):
        return {"ok": True, "ignored": True, "reason": "payment_in_progress"}
    result = await db.display_sessions.update_one(
        {"code": code, "status": {"$nin": ["awaiting_payment", "paid"]}},
        {"$set": {
            "items": [i.model_dump() for i in body.items] if body.items else s.get("items", []),
            "discount": body.discount,
            "tax_rate": body.tax_rate,
            "customer_name": body.customer_name,
            "status": "payment_selection",
            "selected_method": None,
            "selected_method_id": None,
            "payment_intent": None,
            "sync_version": int(s.get("sync_version") or 0) + 1,
            "updated_at": now_iso(),
        }},
    )
    if result.matched_count == 0:
        return {"ok": True, "ignored": True, "reason": "payment_in_progress"}
    return {"ok": True, "status": "payment_selection"}


@api_router.get("/display/public/{code}")
async def display_public(code: str):
    # Find by code first, then check `closed` in Python. This is more reliable
    # with the MySQL document adapter than relying on a Mongo-style `$ne` query.
    s = await _active_display_session(code)
    if not s:
        raise HTTPException(status_code=404, detail="Session tidak ditemukan atau sudah ditutup")

    # Branding and enabled payment methods are admin-controlled. Read them live so
    # an already-open customer display reflects changes without creating a new session.
    live_store = await db.settings.find_one({"id": "store"}, {"_id": 0}) or {}
    display_keys = (
        "name", "tagline", "address", "phone", "email", "logo_url",
        "display_bg_color", "display_accent_color", "display_text_color",
        "display_card_color", "display_welcome",
    )
    session_store = dict(s.get("store") or {})
    for key in display_keys:
        if key in live_store:
            session_store[key] = live_store[key]
    s = dict(s)
    s["store"] = session_store
    if "payment_methods" in live_store:
        s["payment_methods"] = [m for m in (live_store.get("payment_methods") or []) if m.get("enabled")]
    return _public_display_view(s)


@api_router.post("/display/public/{code}/pay")
async def display_pay_by_id(code: str, body: DisplayPayIn):
    """Customer chooses a curated method by id — backend resolves gateway/channel from session snapshot."""
    s = await _active_display_session(code)
    if not s:
        raise HTTPException(status_code=404, detail="Session tidak ditemukan")
    method_cfg = next((m for m in (s.get("payment_methods") or []) if m.get("id") == body.method_id and m.get("enabled")), None)
    if not method_cfg:
        raise HTTPException(status_code=400, detail="Metode pembayaran tidak tersedia")
    kind = method_cfg.get("kind")
    payload = DisplaySelectMethodIn(
        method="qris" if kind == "qris_static" else kind,
        tripay_channel=method_cfg.get("channel"),
    )
    resp = await display_select_method(code, payload)
    await db.display_sessions.update_one(
        {"code": code.upper()},
        {"$set": {"selected_method_id": body.method_id, "selected_method_label": method_cfg.get("label")}},
    )
    return {**resp, "method_id": body.method_id, "method_label": method_cfg.get("label")}


@api_router.post("/display/public/{code}/select-method")
async def display_select_method(code: str, body: DisplaySelectMethodIn):
    s = await _active_display_session(code)
    if not s:
        raise HTTPException(status_code=404, detail="Session tidak ditemukan")
    if s.get("status") not in ("checkout", "payment_selection", "awaiting_payment", "idle"):
        raise HTTPException(status_code=400, detail="Session tidak dapat dibayar")
    # Keep an active online gateway reference immutable until it is validated.
    if s.get("status") == "awaiting_payment" and s.get("payment_intent"):
        return {"ok": True, "intent": s.get("payment_intent"), "locked": True}

    items = [CartItem(**i) for i in s.get("items", [])]
    if not items:
        raise HTTPException(status_code=400, detail="Keranjang kosong")
    discount = float(s.get("discount", 0))
    tax_rate = float(s.get("tax_rate", 0))
    subtotal, tax_amount, disc, total = _compute_total(items, discount, tax_rate)

    intent: Optional[Dict[str, Any]] = None

    if body.method in ("cash", "card"):
        intent = {
            "gateway": body.method,
            "instructions": "Silakan lakukan pembayaran ke kasir.",
            "amount": total,
        }
    elif body.method == "qris":
        # simulated static QRIS — use store name in the QR content
        intent = {
            "gateway": "qris",
            "amount": total,
            "note": "QRIS (simulasi) — bayar di kasir",
        }
    elif body.method == "midtrans":
        server_key = os.environ.get("MIDTRANS_SERVER_KEY", "")
        if not server_key:
            raise HTTPException(status_code=500, detail="Midtrans belum dikonfigurasi")
        order_id = f"DSP-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
        item_details = [{"id": i.product_id, "name": i.name[:50], "price": int(i.price), "quantity": int(i.quantity)} for i in items]
        if disc > 0:
            item_details.append({"id": "DISC", "name": "Diskon", "price": -disc, "quantity": 1})
        if tax_amount > 0:
            item_details.append({"id": "TAX", "name": f"Pajak {tax_rate}%", "price": tax_amount, "quantity": 1})
        payload = {
            "transaction_details": {"order_id": order_id, "gross_amount": total},
            "item_details": item_details,
            "customer_details": {"first_name": (s.get("customer_name") or "Pelanggan")[:30], "email": "guest@rizpos.id"},
        }
        auth = base64.b64encode((server_key + ":").encode()).decode()
        async with httpx.AsyncClient(timeout=20) as ac:
            r = await ac.post(f"{_midtrans_base()}/snap/v1/transactions", json=payload,
                              headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json", "Accept": "application/json"})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Midtrans: {r.text}")
        d = r.json()
        intent = {
            "gateway": "midtrans",
            "order_id": order_id,
            "token": d.get("token"),
            "redirect_url": d.get("redirect_url"),
            "client_key": os.environ.get("MIDTRANS_CLIENT_KEY", ""),
            "amount": total,
        }
    elif body.method == "tripay":
        if not body.tripay_channel:
            raise HTTPException(status_code=400, detail="tripay_channel wajib")
        api_key = os.environ.get("TRIPAY_API_KEY", "")
        private_key = os.environ.get("TRIPAY_PRIVATE_KEY", "")
        merchant = os.environ.get("TRIPAY_MERCHANT_CODE", "")
        if not (api_key and private_key and merchant):
            raise HTTPException(status_code=500, detail="Tripay belum dikonfigurasi")
        merchant_ref = f"DSP{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}{uuid.uuid4().hex[:4].upper()}"
        sig_msg = f"{merchant}{merchant_ref}{total}"
        signature = hmac.new(private_key.encode(), sig_msg.encode(), hashlib.sha256).hexdigest()
        order_items = [{"sku": i.product_id[:24], "name": i.name[:50], "price": int(i.price), "quantity": int(i.quantity)} for i in items]
        payload = {
            "method": body.tripay_channel,
            "merchant_ref": merchant_ref,
            "amount": total,
            "customer_name": s.get("customer_name") or "Pelanggan",
            "customer_email": "guest@rizpos.id",
            "customer_phone": "081234567890",
            "order_items": order_items,
            "expired_time": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            "signature": signature,
        }
        callback_url = os.environ.get("TRIPAY_CALLBACK_URL", "").strip()
        if callback_url:
            payload["callback_url"] = callback_url
        async with httpx.AsyncClient(timeout=20) as ac:
            r = await ac.post(f"{_tripay_base()}/transaction/create", json=payload, headers={"Authorization": f"Bearer {api_key}"})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Tripay: {r.text}")
        d = r.json()
        if not d.get("success"):
            raise HTTPException(status_code=400, detail=d.get("message", "Tripay failed"))
        dd = d["data"]
        intent = {
            "gateway": "tripay",
            "channel": body.tripay_channel,
            "reference": dd.get("reference"),
            "merchant_ref": merchant_ref,
            "checkout_url": dd.get("checkout_url"),
            "qr_url": dd.get("qr_url"),
            "qr_string": dd.get("qr_string"),
            "pay_code": dd.get("pay_code"),
            "amount": total,
            "instructions": dd.get("instructions", []),
        }

    result = await db.display_sessions.update_one(
        {"code": code.upper()},
        {"$set": {
            "selected_method": body.method,
            "payment_intent": intent,
            "status": "awaiting_payment",
            "sync_version": int(s.get("sync_version") or 0) + 1,
            "updated_at": now_iso(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Sesi berubah saat membuat pembayaran, silakan ulangi")
    logger.info("Display payment intent saved: code=%s gateway=%s reference=%s", code.upper(), body.method, intent.get("reference") or intent.get("order_id"))
    return {"ok": True, "intent": intent}


@api_router.get("/display/public/{code}/payment-status")
async def display_payment_status(code: str):
    s = await _active_display_session(code)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    intent = s.get("payment_intent") or {}
    gw = intent.get("gateway")
    paid = False
    detail: Dict[str, Any] = {}
    try:
        if gw == "midtrans" and intent.get("order_id"):
            server_key = os.environ.get("MIDTRANS_SERVER_KEY", "")
            auth = base64.b64encode((server_key + ":").encode()).decode()
            base = "https://api.midtrans.com" if os.environ.get("MIDTRANS_MODE") == "production" else "https://api.sandbox.midtrans.com"
            async with httpx.AsyncClient(timeout=15) as ac:
                r = await ac.get(f"{base}/v2/{intent['order_id']}/status", headers={"Authorization": f"Basic {auth}", "Accept": "application/json"})
            data = r.json()
            ts = data.get("transaction_status")
            paid = ts in ("settlement", "capture") and data.get("fraud_status", "") in ("", "accept")
            detail = {"transaction_status": ts}
        elif gw == "tripay" and intent.get("reference"):
            api_key = os.environ.get("TRIPAY_API_KEY", "")
            async with httpx.AsyncClient(timeout=15) as ac:
                r = await ac.get(f"{_tripay_base()}/transaction/detail?reference={intent['reference']}", headers={"Authorization": f"Bearer {api_key}"})
            dd = r.json().get("data", {})
            detail = {"status": dd.get("status")}
            normalized_status = str(dd.get("status") or "").upper()
            paid = normalized_status in ("PAID", "SETTLED", "SUCCESS")
    except Exception as e:
        detail = {"error": str(e)}
    if paid and s.get("status") != "paid":
        await db.display_sessions.update_one(
            {"code": code.upper()},
            {"$set": {
                "status": "paid",
                "sync_version": int(s.get("sync_version") or 0) + 1,
                "updated_at": now_iso(),
            }},
        )
    return {
        "paid": paid,
        "status": "paid" if paid else s.get("status"),
        "payment_method": intent.get("gateway"),
        "payment_ref": intent.get("reference") or intent.get("order_id"),
        **detail,
    }


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"app": "RizPOS API", "status": "ok"}


# ---------- Seed ----------
async def seed():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@rizpos.id").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Owner",
            "role": "admin",
            "password_hash": hash_password(admin_pw),
            "active": True,
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {admin_email}")

    cashier_email = os.environ.get("CASHIER_EMAIL", "cashier@rizpos.id").lower()
    cashier_pw = os.environ.get("CASHIER_PASSWORD", "cashier123")
    if not await db.users.find_one({"email": cashier_email}):
        await db.users.insert_one({
            "id": new_id(),
            "email": cashier_email,
            "name": "Kasir Utama",
            "role": "cashier",
            "password_hash": hash_password(cashier_pw),
            "active": True,
            "created_at": now_iso(),
        })

    # Seed categories & products if empty
    if await db.categories.count_documents({}) == 0:
        seed_cats = [
            {"name": "Makanan", "color": "#F97316", "icon": "utensils"},
            {"name": "Minuman", "color": "#06B6D4", "icon": "coffee"},
            {"name": "Roti & Kue", "color": "#F59E0B", "icon": "cookie"},
            {"name": "Snack", "color": "#10B981", "icon": "candy"},
        ]
        cat_ids = {}
        for c in seed_cats:
            cid = new_id()
            cat_ids[c["name"]] = cid
            await db.categories.insert_one({"id": cid, **c, "created_at": now_iso()})

        seed_products = [
            {"name": "Kopi Susu Gula Aren", "sku": "BEV-001", "cat": "Minuman", "price": 22000, "cost": 8000, "stock": 100, "unit": "cup"},
            {"name": "Es Teh Manis", "sku": "BEV-002", "cat": "Minuman", "price": 8000, "cost": 2500, "stock": 200, "unit": "cup"},
            {"name": "Americano", "sku": "BEV-003", "cat": "Minuman", "price": 20000, "cost": 7000, "stock": 80, "unit": "cup"},
            {"name": "Croissant Coklat", "sku": "BAK-001", "cat": "Roti & Kue", "price": 18000, "cost": 6000, "stock": 30, "unit": "pcs"},
            {"name": "Roti Bakar Keju", "sku": "BAK-002", "cat": "Roti & Kue", "price": 15000, "cost": 5000, "stock": 40, "unit": "pcs"},
            {"name": "Nasi Goreng Spesial", "sku": "FOD-001", "cat": "Makanan", "price": 35000, "cost": 12000, "stock": 50, "unit": "porsi"},
            {"name": "Mie Ayam", "sku": "FOD-002", "cat": "Makanan", "price": 25000, "cost": 8000, "stock": 40, "unit": "porsi"},
            {"name": "Kentang Goreng", "sku": "SNK-001", "cat": "Snack", "price": 15000, "cost": 5000, "stock": 60, "unit": "porsi"},
            {"name": "Pisang Goreng", "sku": "SNK-002", "cat": "Snack", "price": 12000, "cost": 4000, "stock": 3, "unit": "pcs"},
        ]
        for p in seed_products:
            await db.products.insert_one({
                "id": new_id(),
                "name": p["name"],
                "sku": p["sku"],
                "category_id": cat_ids.get(p["cat"]),
                "price": p["price"],
                "cost": p["cost"],
                "stock": p["stock"],
                "unit": p["unit"],
                "image_url": None,
                "description": None,
                "active": True,
                "created_at": now_iso(),
            })

    # Write test_credentials.md
    memory_dir = ROOT_DIR.parent / "memory"
    memory_dir.mkdir(exist_ok=True)
    (memory_dir / "test_credentials.md").write_text(
        f"""# RizPOS Test Credentials

## Admin
- Email: {admin_email}
- Password: {admin_pw}
- Role: admin

## Cashier
- Email: {cashier_email}
- Password: {cashier_pw}
- Role: cashier

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
""",
        encoding="utf-8",
    )


@app.on_event("startup")
async def on_startup():
    await db.ensure_schema()
    await seed()


@app.on_event("shutdown")
async def on_shutdown():
    await db.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
