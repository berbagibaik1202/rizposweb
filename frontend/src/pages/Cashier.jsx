import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, X, Wallet, CreditCard, QrCode, Package, Printer, ScanLine, Building2, CheckCircle2, Monitor, ExternalLink, Copy } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import api, { formatIDR, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { printReceipt } from "../lib/printReceipt";
import Receipt from "../components/Receipt";

const QUICK_CASH = [10000, 20000, 50000, 100000, 200000];
const DEFAULT_PAYMENT_METHODS = [
  { id: "cash", kind: "cash", label: "Tunai", icon: "wallet", enabled: true },
  { id: "card", kind: "card", label: "Kartu", icon: "credit-card", enabled: true },
  { id: "qris", kind: "qris_static", label: "QRIS", icon: "qr-code", enabled: true },
  { id: "midtrans", kind: "midtrans", label: "Pembayaran Online", icon: "credit-card", enabled: true },
  { id: "tripay", kind: "tripay", label: "Pembayaran Online", channel: "QRIS", icon: "building", enabled: true },
];

const CASHIER_DRAFT_KEY = "rizpos_cashier_draft";
const readCashierDraft = () => {
  try { return JSON.parse(localStorage.getItem(CASHIER_DRAFT_KEY) || "null") || {}; }
  catch { return {}; }
};

export default function Cashier() {
  const { user } = useAuth();
  const draft = useMemo(readCashierDraft, []);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState(() => Array.isArray(draft.cart) ? draft.cart : []);
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [customerId, setCustomerId] = useState(() => draft.customerId || "none");
  const [discount, setDiscount] = useState(() => Number(draft.discount) || 0);
  const [taxRate, setTaxRate] = useState(() => Number(draft.taxRate) || 0);
  const [showPay, setShowPay] = useState(() => Boolean(draft.showPay));
  const [pm, setPm] = useState(() => draft.pm || "cash");
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_PAYMENT_METHODS);
  const [amountPaid, setAmountPaid] = useState(0);
  const [lastTx, setLastTx] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [mobileCart, setMobileCart] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeRef = useRef(null);
  const scanBufferRef = useRef({ buf: "", ts: 0 });
  const [tripayMethod, setTripayMethod] = useState("QRIS");
  const [gwBusy, setGwBusy] = useState(false);
  const [gwIntent, setGwIntent] = useState(() => draft.gwIntent || null); // { gateway, order_id/reference, ... }
  const pollRef = useRef(null);
  const [displayCode, setDisplayCode] = useState(null);
  const [showDisplayInfo, setShowDisplayInfo] = useState(false);
  const [displayPaymentRequested, setDisplayPaymentRequested] = useState(false);
  const displaySyncVersion = useRef(Date.now() * 1000);
  const displayWindowRef = useRef(null);
  const displayFinalizedRef = useRef(null);
  const displayPaymentHoldRef = useRef(false);
  const displayResetTimerRef = useRef(null);
  const displayNewTransactionRef = useRef(false);

  const beginNewDisplayTransaction = () => {
    if (displayResetTimerRef.current) {
      window.clearTimeout(displayResetTimerRef.current);
      displayResetTimerRef.current = null;
    }
    displayPaymentHoldRef.current = false;
    displayNewTransactionRef.current = true;
  };

  // Keep an unfinished cashier transaction available after a browser reload.
  useEffect(() => {
    if (cart.length > 0 || discount > 0 || taxRate > 0 || customerId !== "none" || gwIntent) {
      localStorage.setItem(CASHIER_DRAFT_KEY, JSON.stringify({
        cart, discount, taxRate, customerId, pm, showPay, gwIntent,
      }));
    } else {
      localStorage.removeItem(CASHIER_DRAFT_KEY);
    }
  }, [cart, discount, taxRate, customerId, pm, showPay, gwIntent]);

  const scanBarcode = async (code) => {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(trimmed)}`);
      addToCart(data);
      toast.success(`+ ${data.name}`);
    } catch (e) {
      toast.error(`Barcode "${trimmed}" tidak ditemukan`);
    }
  };

  // Global hardware barcode scanner listener (fast keystrokes ending with Enter)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if (isEditable) return;
      const now = Date.now();
      const b = scanBufferRef.current;
      if (now - b.ts > 100) b.buf = "";
      b.ts = now;
      if (e.key === "Enter") {
        if (b.buf.length >= 3) { scanBarcode(b.buf); }
        b.buf = "";
        return;
      }
      if (e.key.length === 1) b.buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [products]);

  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/categories").then((r) => setCategories(r.data));
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/settings").then((r) => {
      const methods = (r.data?.payment_methods || []).filter((m) => m.enabled !== false);
      if (methods.length) setPaymentMethods(methods);
    }).catch(() => {});
  };
  useEffect(load, []);

  // Load Midtrans Snap.js
  useEffect(() => {
    if (document.getElementById("midtrans-snap")) return;
    const s = document.createElement("script");
    s.id = "midtrans-snap";
    s.src = "https://app.sandbox.midtrans.com/snap/snap.js";
    document.body.appendChild(s);
  }, []);

  const filtered = useMemo(() => products.filter((p) => {
    if (activeCat !== "all" && p.category_id !== activeCat) return false;
    if (q && !(`${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return p.active !== false;
  }), [products, q, activeCat]);

  const addToCart = (p) => {
    if (p.stock <= 0) return toast.error("Stok habis");
    beginNewDisplayTransaction();
    setCart((c) => {
      const found = c.find((i) => i.product_id === p.id);
      if (found) {
        if (found.quantity + 1 > p.stock) { toast.error("Melebihi stok"); return c; }
        return c.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price } : i);
      }
      return [...c, { product_id: p.id, name: p.name, price: p.price, quantity: 1, subtotal: p.price }];
    });
  };

  const changeQty = (pid, delta) => {
    setCart((c) => c.map((i) => {
      if (i.product_id !== pid) return i;
      const nq = i.quantity + delta;
      if (nq <= 0) return null;
      return { ...i, quantity: nq, subtotal: nq * i.price };
    }).filter(Boolean));
  };

  const removeItem = (pid) => setCart((c) => c.filter((i) => i.product_id !== pid));
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setTaxRate(0);
    setCustomerId("none");
    setGwIntent(null);
    setShowPay(false);
    localStorage.removeItem(CASHIER_DRAFT_KEY);
  };

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal - discount + taxAmount;

  // ---------- Customer Display sync ----------
  const openDisplay = async () => {
    try {
      const { data } = await api.post("/display/sessions");
      setDisplayCode(data.code);
      setDisplayPaymentRequested(false);
      localStorage.setItem("rizpos_display_code", data.code);
      setShowDisplayInfo(true);
      // Push the current cart immediately. This avoids a race when a new
      // display session is opened while a transaction is already in progress.
      const cust = customers.find((c) => c.id === customerId);
      try {
        await api.put(`/display/sessions/${data.code}`, {
          items: cart,
          discount: Number(discount) || 0,
          tax_rate: Number(taxRate) || 0,
          customer_name: cust?.name || null,
          status: cart.length ? "checkout" : "idle",
          sync_version: ++displaySyncVersion.current,
          force_reset: cart.length === 0,
        });
      } catch {}
      displayWindowRef.current = window.open(`/display/${data.code}`, "rizpos-display", "width=1024,height=720");
      toast.success(`Layar pelanggan aktif · ${data.code}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const closeDisplay = async () => {
    if (!displayCode) return;
    try { await api.post(`/display/sessions/${displayCode}/close`); } catch {}
    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      displayWindowRef.current.close();
    }
    displayWindowRef.current = null;
    localStorage.removeItem("rizpos_display_code");
    setDisplayCode(null);
    setDisplayPaymentRequested(false);
    setShowDisplayInfo(false);
    toast.message("Layar pelanggan ditutup");
  };

  useEffect(() => {
    const saved = localStorage.getItem("rizpos_display_code");
    if (!saved) return;
    // Do not keep a closed/replaced session in the cashier UI after a reload.
    // The old customer-display window will then be clearly obsolete instead of
    // making the cashier sync its cart to a dead session.
    api.get(`/display/public/${saved}`)
      .then(() => setDisplayCode(saved))
      .catch(() => {
        localStorage.removeItem("rizpos_display_code");
        setDisplayCode(null);
      });
  }, []);

  // Sync cart -> display every time cart/discount/tax changes
  useEffect(() => {
    if (!displayCode || displayPaymentHoldRef.current) return;
    const cust = customers.find((c) => c.id === customerId);
    const status = cart.length === 0 ? "idle" : ((showPay || displayPaymentRequested) ? "payment_selection" : "checkout");
    const syncVersion = ++displaySyncVersion.current;
    const newTransaction = displayNewTransactionRef.current;
    const t = setTimeout(() => {
      api.put(`/display/sessions/${displayCode}`, {
        items: cart,
        discount: Number(discount) || 0,
        tax_rate: Number(taxRate) || 0,
        customer_name: cust?.name || null,
        status,
        sync_version: syncVersion,
        force_reset: cart.length === 0,
        new_transaction: newTransaction,
      }).then(() => {
        if (newTransaction) displayNewTransactionRef.current = false;
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [cart, discount, taxRate, customerId, displayCode, showPay, displayPaymentRequested]);

  const openPay = async () => {
    if (cart.length === 0) return toast.error("Keranjang kosong");
    if (displayCode) {
      setGwIntent(null);
      setPm("cash");
      setAmountPaid(total);
      setShowPay(true);
      setDisplayPaymentRequested(true);
      try {
        const cust = customers.find((c) => c.id === customerId);
        await api.post(`/display/sessions/${displayCode}/request-payment`, {
          items: cart,
          discount: Number(discount) || 0,
          tax_rate: Number(taxRate) || 0,
          customer_name: cust?.name || null,
        });
      } catch (e) {
        toast.error(formatApiError(e));
      }
      toast.success("Metode pembayaran tersedia di kasir dan layar pelanggan");
      return;
    }
    setPm("cash");
    setAmountPaid(total);
    setGwIntent(null);
    setShowPay(true);
  };

  const choosePaymentMethod = (method) => {
    const kind = method.kind === "qris_static" ? "qris" : method.kind;
    setPm(kind);
    if (kind === "tripay") setTripayMethod(method.channel || "QRIS");
    if (kind !== "cash") setAmountPaid(total);
    setGwIntent(null);
  };

  const setClientKeyAttr = (key) => {
    const s = document.getElementById("midtrans-snap");
    if (s) s.setAttribute("data-client-key", key);
  };

  const publishDisplayIntent = async (method, data) => {
    if (!displayCode) return;
    try {
      await api.post(`/display/sessions/${displayCode}/payment-intent`, {
        method,
        intent: data,
      });
    } catch (e) {
      toast.error("Gagal mengirim instruksi ke layar pelanggan");
    }
  };

  const finalizeTx = async (payment_ref, payment_method = pm) => {
    try {
      const payload = {
        items: cart,
        customer_id: customerId === "none" ? null : customerId,
        payment_method,
        amount_paid: total,
        discount: Number(discount) || 0,
        tax_rate: Number(taxRate) || 0,
        payment_ref,
      };
      const { data } = await api.post("/transactions", payload);
      setLastTx(data);
      setShowPay(false);
      setGwIntent(null);
      setDisplayPaymentRequested(false);
      setShowReceipt(true);
      if (displayCode && payment_ref) displayPaymentHoldRef.current = true;
      setCart([]);
      setDiscount(0);
      setCustomerId("none");
      load();
      toast.success("Pembayaran berhasil");
      if (displayCode && payment_ref) {
        const code = displayCode;
        displayResetTimerRef.current = window.setTimeout(async () => {
          try { await api.post(`/display/sessions/${code}/reset`); } catch {}
          displayPaymentHoldRef.current = false;
          displayResetTimerRef.current = null;
        }, 6000);
      }
      return true;
    } catch (e) { toast.error(formatApiError(e)); return false; }
  };

  const chargeMidtrans = async () => {
    setGwBusy(true);
    try {
      const cust = customers.find((c) => c.id === customerId);
      const { data } = await api.post("/payments/midtrans/charge", {
        items: cart, discount, tax_rate: taxRate,
        customer_id: customerId === "none" ? null : customerId,
        customer_name: cust?.name || "Pelanggan",
        customer_email: cust?.email || "guest@rizpos.id",
        customer_phone: cust?.phone || "",
      });
      setClientKeyAttr(data.client_key);
      setGwIntent({ gateway: "midtrans", ...data });
      await publishDisplayIntent("midtrans", data);
      if (window.snap && data.token) {
        window.snap.pay(data.token, {
          onSuccess: () => finalizeTx(data.order_id),
          onPending: () => toast.info("Menunggu pembayaran Midtrans…"),
          onError: () => toast.error("Pembayaran Midtrans gagal"),
          onClose: () => toast.message("Popup ditutup. Anda bisa cek status di bawah."),
        });
      } else if (data.redirect_url) {
        window.open(data.redirect_url, "_blank");
      }
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setGwBusy(false); }
  };

  const chargeTripay = async () => {
    setGwBusy(true);
    try {
      const cust = customers.find((c) => c.id === customerId);
      const { data } = await api.post("/payments/tripay/charge", {
        items: cart, discount, tax_rate: taxRate,
        customer_id: customerId === "none" ? null : customerId,
        customer_name: cust?.name || "Pelanggan",
        customer_email: cust?.email || "guest@rizpos.id",
        customer_phone: cust?.phone || "081234567890",
        tripay_method: tripayMethod,
      });
      setGwIntent({ gateway: "tripay", ...data });
      await publishDisplayIntent("tripay", data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setGwBusy(false); }
  };

  const checkGatewayStatus = async () => {
    if (!gwIntent) return;
    try {
      if (gwIntent.gateway === "midtrans") {
        const { data } = await api.get(`/payments/midtrans/status/${gwIntent.order_id}`);
        if (data.paid) finalizeTx(gwIntent.order_id);
        else toast.info(`Status: ${data.transaction_status || "pending"}`);
      } else {
        const { data } = await api.get(`/payments/tripay/status/${gwIntent.reference}`);
        if (data.paid) finalizeTx(gwIntent.reference);
        else toast.info(`Status: ${data.status || "pending"}`);
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // Auto-poll status when tripay intent is open
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (gwIntent?.gateway === "tripay" && gwIntent.reference) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/payments/tripay/status/${gwIntent.reference}`);
          if (data.paid) { clearInterval(pollRef.current); finalizeTx(gwIntent.reference); }
        } catch {}
      }, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line
  }, [gwIntent]);

  // When payment is initiated from Customer Display, the cashier does not have
  // a local gateway intent. Poll the shared display session and finalize the
  // transaction here after the gateway confirms payment.
  useEffect(() => {
    if (!displayCode || cart.length === 0) return undefined;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get(`/display/public/${displayCode}/payment-status`);
        const ref = data.payment_ref;
        if (!data.paid || !ref || displayFinalizedRef.current === ref) return;
        displayFinalizedRef.current = ref;
        const completed = await finalizeTx(ref, data.payment_method || "tripay");
        if (!completed) displayFinalizedRef.current = null;
      } catch {}
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [displayCode, cart.length]);

  const process = async () => {
    if (pm === "midtrans") return chargeMidtrans();
    if (pm === "tripay") return chargeTripay();
    try {
      const payload = {
        items: cart,
        customer_id: customerId === "none" ? null : customerId,
        payment_method: pm,
        amount_paid: pm === "cash" ? Number(amountPaid) : total,
        discount: Number(discount) || 0,
        tax_rate: Number(taxRate) || 0,
      };
      const { data } = await api.post("/transactions", payload);
      setLastTx(data);
      setShowPay(false);
      setShowReceipt(true);
      setCart([]);
      setDiscount(0);
      setCustomerId("none");
      load();
      toast.success("Transaksi berhasil");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const catName = (id) => categories.find((c) => c.id === id)?.name || "";
  const catColor = (id) => categories.find((c) => c.id === id)?.color || "#94A3B8";

  return (
    <div className="grid lg:grid-cols-8 gap-6 -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8" data-testid="cashier-page">
      {/* Products */}
      <div className="lg:col-span-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Kasir</h1>
            <p className="text-sm text-muted-foreground">Pilih produk untuk ditambahkan ke keranjang.</p>
          </div>
          {displayCode ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-2 py-1.5 px-3 border-emerald-500/40 bg-emerald-500/5">
                <Monitor className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-mono font-bold">{displayCode}</span>
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setShowDisplayInfo(true)} data-testid="display-info">Info</Button>
              <Button size="sm" variant="ghost" onClick={closeDisplay} data-testid="close-display"><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={openDisplay} data-testid="open-display" className="gap-2">
              <Monitor className="w-4 h-4" /> Buka Layar Pelanggan
            </Button>
          )}
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari nama atau SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-11" data-testid="cashier-search" />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); scanBarcode(barcodeInput); setBarcodeInput(""); }}
            className="relative flex-1 min-w-[200px]"
          >
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              ref={barcodeRef}
              placeholder="Scan barcode / ketik SKU + Enter"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="pl-9 pr-20 h-11 font-mono"
              data-testid="barcode-input"
            />
            <Button type="submit" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-9" data-testid="barcode-scan">Scan</Button>
          </form>
          <Button className="lg:hidden h-11 relative" onClick={() => setMobileCart(true)} data-testid="mobile-cart-button">
            <ShoppingCart className="w-4 h-4 mr-2" /> Keranjang
            {cart.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary-foreground text-primary text-xs font-bold flex items-center justify-center">{cart.length}</span>}
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <Button size="sm" variant={activeCat === "all" ? "default" : "outline"} onClick={() => setActiveCat("all")} data-testid="cat-all">Semua</Button>
          {categories.map((c) => (
            <Button key={c.id} size="sm" variant={activeCat === c.id ? "default" : "outline"} onClick={() => setActiveCat(c.id)} data-testid={`cat-${c.id}`}>
              <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: c.color }} />
              {c.name}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stock <= 0}
              data-testid={`product-card-${p.sku}`}
              className="text-left group rounded-xl border bg-card p-3 hover:border-primary hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:transform-none transition-all"
            >
              <div className="aspect-square rounded-lg bg-secondary flex items-center justify-center mb-3 relative overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-10 h-10 text-muted-foreground/50" />
                )}
                <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0" style={{ backgroundColor: catColor(p.category_id), color: "#fff" }}>{catName(p.category_id) || "—"}</Badge>
                {p.stock <= 5 && <Badge variant="destructive" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0">{p.stock <= 0 ? "Habis" : `Sisa ${p.stock}`}</Badge>}
              </div>
              <div className="font-medium text-sm leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">{p.sku}</span>
                <span className="font-mono font-bold text-primary text-sm">{formatIDR(p.price)}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12 text-sm">Tidak ada produk.</div>}
        </div>
      </div>

      {/* Cart */}
      <CartPanel
        className={`lg:col-span-3 lg:block ${mobileCart ? "fixed inset-0 z-50 bg-background overflow-y-auto p-4" : "hidden"}`}
        onCloseMobile={() => setMobileCart(false)}
        cart={cart}
        changeQty={changeQty}
        removeItem={removeItem}
        clearCart={clearCart}
        customers={customers}
        customerId={customerId}
        setCustomerId={setCustomerId}
        discount={discount}
        setDiscount={setDiscount}
        taxRate={taxRate}
        setTaxRate={setTaxRate}
        subtotal={subtotal}
        taxAmount={taxAmount}
        total={total}
        openPay={openPay}
      />

      {/* Payment Modal */}
      <Dialog open={showPay} onOpenChange={setShowPay}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Tagihan</div>
              <div className="font-mono font-extrabold text-3xl text-primary mt-1">{formatIDR(total)}</div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {paymentMethods.map((m) => {
                const kind = m.kind === "qris_static" ? "qris" : m.kind;
                const icons = { wallet: Wallet, "credit-card": CreditCard, "qr-code": QrCode, building: Building2 };
                const Icon = icons[m.icon] || (kind === "cash" ? Wallet : CreditCard);
                return (
                <button
                  key={m.id || kind}
                  onClick={() => choosePaymentMethod(m)}
                  data-testid={`pay-${m.id || kind}`}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1.5 transition-all ${pm === kind ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
                );
              })}
            </div>

            {pm === "cash" && (
              <div className="space-y-3">
                <div>
                  <Label>Uang Diterima</Label>
                  <Input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="mt-1.5 h-11 font-mono text-lg"
                    data-testid="cash-input"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_CASH.map((v) => (
                    <Button key={v} size="sm" variant="outline" onClick={() => setAmountPaid(v)} data-testid={`quick-cash-${v}`}>
                      {formatIDR(v)}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setAmountPaid(total)}>Uang Pas</Button>
                </div>
                {amountPaid >= total && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                    <span className="text-sm">Kembalian</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(amountPaid - total)}</span>
                  </div>
                )}
              </div>
            )}

            {pm === "qris" && (
              <div className="flex flex-col items-center p-4 rounded-lg border">
                <div className="w-40 h-40 bg-white grid-bg border-4 border-primary rounded-lg flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">Scan QR untuk membayar (simulasi)</p>
              </div>
            )}

            {pm === "card" && (
              <div className="p-4 rounded-lg border text-center text-sm text-muted-foreground">
                Silakan tap/gesek kartu pada mesin EDC (simulasi)
              </div>
            )}

            {pm === "midtrans" && !gwIntent && (
              <div className="p-4 rounded-lg border bg-primary/5 space-y-2">
                <div className="text-sm font-medium">Midtrans Snap</div>
                <p className="text-xs text-muted-foreground">Popup pembayaran akan terbuka — dukung kartu, QRIS, VA, e-wallet, dll. (mode sandbox).</p>
              </div>
            )}
            {pm === "midtrans" && gwIntent && (
              <div className="p-4 rounded-lg border bg-emerald-500/5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono">{gwIntent.order_id}</span></div>
                <Button variant="outline" size="sm" onClick={checkGatewayStatus} className="w-full">Cek Status Pembayaran</Button>
              </div>
            )}

            {pm === "tripay" && !gwIntent && (
              <div className="p-4 rounded-lg border bg-primary/5 text-sm">
                Metode provider yang dipilih admin: <span className="font-semibold">{tripayMethod}</span>
              </div>
            )}
            {pm === "tripay" && gwIntent && (
              <div className="p-3 rounded-lg border bg-emerald-500/5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{gwIntent.reference}</span></div>
                {gwIntent.pay_code && <div className="flex justify-between"><span className="text-muted-foreground">Kode Bayar</span><span className="font-mono font-bold">{gwIntent.pay_code}</span></div>}
                {gwIntent.qr_url && (
                  <div className="flex flex-col items-center">
                    <img src={gwIntent.qr_url} alt="QR" className="w-40 h-40 rounded-lg border" />
                    <p className="text-xs text-muted-foreground mt-2">Scan QR untuk membayar</p>
                  </div>
                )}
                {gwIntent.checkout_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(gwIntent.checkout_url, "_blank")} className="w-full">
                    Buka Halaman Pembayaran
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={checkGatewayStatus} className="w-full">Cek Status Pembayaran</Button>
                <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3 animate-pulse" /> Auto-refresh setiap 4 detik
                </div>
              </div>
            )}

            {!gwIntent && (
              <Button onClick={process} disabled={gwBusy} className="w-full h-12 text-base font-semibold" data-testid="process-payment">
                {gwBusy ? "Memproses…" : `Bayar ${formatIDR(total)}`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Display Info Modal */}
      <Dialog open={showDisplayInfo} onOpenChange={setShowDisplayInfo}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Layar Pelanggan Aktif</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Session Code</div>
              <div className="font-mono font-extrabold text-4xl text-primary mt-2 tracking-widest">{displayCode}</div>
            </div>
            <div>
              <Label className="text-xs">Link Publik (buka di tablet/PC kedua)</Label>
              <div className="mt-1 flex gap-2">
                <Input readOnly value={`${window.location.origin}/display/${displayCode}`} className="font-mono text-xs" data-testid="display-link" />
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/display/${displayCode}`); toast.success("Link disalin"); }}><Copy className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Bagikan link ini ke perangkat kedua. Keranjang akan otomatis tersinkron.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => window.open(`/display/${displayCode}`, "rizpos-display", "width=1024,height=720")}>
                <ExternalLink className="w-4 h-4 mr-2" /> Buka Ulang
              </Button>
              <Button variant="destructive" onClick={closeDisplay}>Tutup Session</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="font-heading">Struk Digital</DialogTitle>
          </DialogHeader>
          {lastTx && <Receipt tx={lastTx} cashier={user?.name} />}
          <div className="p-4 pt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setShowReceipt(false)}>Tutup</Button>
            <Button onClick={() => printReceipt("rizpos-receipt")} data-testid="print-receipt"><Printer className="w-4 h-4 mr-2" />Cetak</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartPanel({ className, onCloseMobile, cart, changeQty, removeItem, clearCart, customers, customerId, setCustomerId, discount, setDiscount, taxRate, setTaxRate, subtotal, taxAmount, total, openPay }) {
  return (
    <aside className={className}>
      <Card className="lg:sticky lg:top-4 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Keranjang ({cart.length})</h3>
          <div className="flex gap-1">
            {cart.length > 0 && <Button size="icon" variant="ghost" onClick={clearCart}><Trash2 className="w-4 h-4" /></Button>}
            {onCloseMobile && <Button size="icon" variant="ghost" className="lg:hidden" onClick={onCloseMobile}><X className="w-4 h-4" /></Button>}
          </div>
        </div>

        <div className="space-y-2 max-h-[40vh] lg:max-h-[38vh] overflow-y-auto -mx-2 px-2">
          {cart.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Belum ada item
            </div>
          )}
          {cart.map((i) => (
            <div key={i.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{i.name}</div>
                <div className="text-xs font-mono text-muted-foreground">{formatIDR(i.price)}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(i.product_id, -1)}><Minus className="w-3 h-3" /></Button>
                <span className="w-6 text-center text-sm font-mono font-bold">{i.quantity}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(i.product_id, 1)}><Plus className="w-3 h-3" /></Button>
              </div>
              <div className="font-mono font-semibold text-sm w-20 text-right">{formatIDR(i.subtotal)}</div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(i.product_id)}><X className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div>
            <Label className="text-xs">Pelanggan</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih pelanggan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Umum / Guest</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Diskon (Rp)</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Pajak (%)</Label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatIDR(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Diskon</span><span className="font-mono text-destructive">-{formatIDR(discount)}</span></div>}
          {taxRate > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Pajak ({taxRate}%)</span><span className="font-mono">{formatIDR(taxAmount)}</span></div>}
          <div className="flex justify-between items-end pt-2 border-t">
            <span className="font-heading font-bold">TOTAL</span>
            <span className="font-mono font-extrabold text-2xl text-primary">{formatIDR(total)}</span>
          </div>
        </div>

        <Button className="w-full h-12 text-base font-bold" onClick={openPay} disabled={cart.length === 0} data-testid="checkout-button">
          Proses Pembayaran
        </Button>
      </Card>
    </aside>
  );
}
