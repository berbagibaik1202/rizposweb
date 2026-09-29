import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import {
  Store, Wallet, CreditCard, QrCode, Building2, ShoppingCart,
  CheckCircle2, Loader2, Clock, Sparkles, Copy, ArrowLeft, XCircle,
} from "lucide-react";

const idr = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

const METHODS = [
  { k: "cash", label: "Tunai", desc: "Bayar langsung ke kasir", icon: Wallet, color: "from-emerald-500 to-emerald-600" },
  { k: "card", label: "Kartu Debit/Kredit", desc: "Tap / gesek di mesin EDC", icon: CreditCard, color: "from-blue-500 to-blue-600" },
  { k: "qris", label: "QRIS", desc: "Semua e-wallet & mobile banking", icon: QrCode, color: "from-fuchsia-500 to-purple-600" },
  { k: "midtrans", label: "Midtrans", desc: "Kartu / QRIS / VA / e-wallet", icon: CreditCard, color: "from-cyan-500 to-teal-600" },
  { k: "tripay", label: "Tripay", desc: "VA / Retail / QRIS / e-wallet", icon: Building2, color: "from-orange-500 to-red-500" },
];

export default function CustomerDisplay() {
  const { code } = useParams();
  const CODE = (code || "").toUpperCase();
  const [state, setState] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [confetti, setConfetti] = useState(false);
  const prevStatus = useRef(null);
  const snapLoaded = useRef(false);
  const fetchSequence = useRef(0);
  const stateRef = useRef(null);
  const notFoundCount = useRef(0);

  // Load Midtrans snap.js
  useEffect(() => {
    if (document.getElementById("midtrans-snap-cd")) return;
    const s = document.createElement("script");
    s.id = "midtrans-snap-cd";
    s.src = "https://app.sandbox.midtrans.com/snap/snap.js";
    s.onload = () => { snapLoaded.current = true; };
    document.body.appendChild(s);
  }, []);

  const fetchState = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    try {
      const { data } = await axios.get(`${API}/display/public/${CODE}`);
      // Ignore a slower response that was started before a newer poll.
      if (sequence !== fetchSequence.current) return;
      // The backend rejects stale writes, but an HTTP GET that started earlier
      // can still arrive after a newer response. Never let an older checkout
      // state replace the current payment-selection state.
      if (
        stateRef.current?.sync_version != null &&
        data.sync_version != null &&
        Number(data.sync_version) < Number(stateRef.current.sync_version)
      ) return;
      // Do not let an older empty-cart response replace an active payment cart.
      if (
        stateRef.current?.items?.length > 0 &&
        (!data.items || data.items.length === 0) &&
        ["idle", "checkout"].includes(data.status) &&
        Number(data.sync_version || 0) < Number(stateRef.current.sync_version || 0)
      ) return;
      // Keep the active QRIS screen if a delayed cashier snapshot briefly
      // returns payment_selection/checkout without the payment intent.
      // The backend also protects this state, but this prevents one stale
      // response from flashing the previous screen in the browser.
      if (
        stateRef.current?.status === "awaiting_payment" &&
        stateRef.current?.payment_intent &&
        data.status !== "paid" &&
        !data.payment_intent
      ) return;
      notFoundCount.current = 0;
      stateRef.current = data;
      setState(data);
      setErr("");
      if (data.payment_intent?.client_key) {
        const s = document.getElementById("midtrans-snap-cd");
        if (s) s.setAttribute("data-client-key", data.payment_intent.client_key);
      }
      if (data.status === "paid" && prevStatus.current !== "paid") {
        setConfetti(true);
        setTimeout(() => setConfetti(false), 6000);
      }
      prevStatus.current = data.status;
    } catch (e) {
      if (sequence !== fetchSequence.current) return;
      // A newly created session can briefly return 404 while the backend and
      // browser settle. Keep the last valid screen during that short window;
      // only mark it inactive after several consecutive misses.
      if (e?.response?.status === 404) {
        notFoundCount.current += 1;
        // Once this window has received a valid session, a 404 means that
        // session was closed/replaced. Clear its old transaction immediately
        // so a closed display cannot keep showing the previous cart.
        if (stateRef.current || notFoundCount.current >= 3) {
          stateRef.current = null;
          setState(null);
          setErr(e?.response?.data?.detail || "Session tidak ditemukan");
        }
      } else if (!stateRef.current) {
        setErr(e?.response?.data?.detail || "Session tidak ditemukan");
      }
    }
  }, [CODE]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2500);
    return () => clearInterval(id);
  }, [fetchState]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // A cashier can replace the display session while an older display window
  // is still open. Follow the newest session instead of showing old and new
  // transactions in separate windows at the same time.
  useEffect(() => {
    const savedCode = (localStorage.getItem("rizpos_display_code") || "").toUpperCase();
    if (savedCode && savedCode !== CODE) {
      window.location.replace(`/display/${savedCode}`);
      return undefined;
    }
    const onStorage = (event) => {
      if (event.key !== "rizpos_display_code") return;
      const nextCode = (event.newValue || "").toUpperCase();
      if (nextCode && nextCode !== CODE) {
        window.location.replace(`/display/${nextCode}`);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [CODE]);

  // Poll gateway payment status once intent exists
  useEffect(() => {
    const gw = state?.payment_intent?.gateway;
    if (!gw || (gw !== "midtrans" && gw !== "tripay")) return;
    if (state?.status === "paid") return;
    const id = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API}/display/public/${CODE}/payment-status`);
        if (data.paid) {
          setState((previous) => {
            const next = { ...(previous || stateRef.current), status: "paid" };
            stateRef.current = next;
            return next;
          });
        }
      } catch {}
    }, 4000);
    return () => clearInterval(id);
  }, [state?.payment_intent?.gateway, state?.status, CODE]);

  const selectMethod = async (methodId, method, channel = null) => {
    setBusy(true);
    try {
      const configuredMethods = state?.payment_methods || state?.store?.payment_methods || [];
      const { data } = configuredMethods.length > 0
        ? await axios.post(`${API}/display/public/${CODE}/pay`, { method_id: methodId })
        : await axios.post(`${API}/display/public/${CODE}/select-method`, { method, tripay_channel: channel });
      // Trigger Midtrans snap popup if available
      if (method === "midtrans" && data.intent?.token && window.snap) {
        const s = document.getElementById("midtrans-snap-cd");
        if (s && data.intent.client_key) s.setAttribute("data-client-key", data.intent.client_key);
        window.snap.pay(data.intent.token, {
          onSuccess: () => fetchState(),
          onPending: () => fetchState(),
          onError: () => {},
          onClose: () => {},
        });
      }
      // Render the gateway response immediately. A poll started just before
      // the click can still return the previous payment_selection/empty state;
      // do not let that response make a successful QRIS selection look like
      // an empty cart.
      if (data.intent) {
        setState((previous) => {
          const next = {
            ...(previous || state),
            status: "awaiting_payment",
            selected_method: method,
            selected_method_id: methodId,
            payment_intent: data.intent,
          };
          stateRef.current = next;
          return next;
        });
      }
      window.setTimeout(fetchState, 500);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Gagal memilih metode");
    } finally { setBusy(false); }
  };

  const resetMethod = async () => {
    try {
      await axios.post(`${API}/display/public/${CODE}/cancel-payment`);
      await fetchState();
      // then reload — customer can pick again; but easier: reload state
    } catch {}
  };

  if (err && !state) {
    return (
      <div className="min-h-screen bg-[#0F1115] text-white flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto" />
          <h1 className="font-heading text-3xl font-bold mt-4">Display Tidak Aktif</h1>
          <p className="text-white/60 mt-2">Kode: <span className="font-mono">{CODE}</span></p>
          <p className="text-white/40 text-sm mt-4">Session ini sudah diganti atau ditutup. Gunakan window Customer Display terbaru.</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-[#0F1115] text-white flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="customer-display h-screen flex flex-col overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${state.store?.display_bg_color || "#0F1115"}, ${state.store?.display_card_color || "#161920"}, ${state.store?.display_bg_color || "#0F1115"})`,
        color: state.store?.display_text_color || "#FFFFFF",
        "--display-accent": state.store?.display_accent_color || "#F97316",
        "--display-card": state.store?.display_card_color || "#161920",
      }}
    >
      <style>{`
        .customer-display .text-primary { color: var(--display-accent) !important; }
        .customer-display .bg-primary { background-color: var(--display-accent) !important; }
        .customer-display .border-primary { border-color: var(--display-accent) !important; }
      `}</style>
      <Confetti active={confetti} />

      <TopBar store={state.store} code={CODE} now={now} />

      {state.status === "paid" ? (
        <PaidScreen state={state} />
      ) : state.status === "awaiting_payment" && state.payment_intent ? (
        <AwaitingPayment state={state} onBack={resetMethod} />
      ) : state.items.length === 0 ? (
        <IdleScreen store={state.store} code={CODE} />
      ) : state.status === "payment_selection" ? (
        <CheckoutScreen state={state} busy={busy} onPick={selectMethod} showPaymentMethods error={err} />
      ) : (
        <CheckoutScreen state={state} busy={busy} onPick={selectMethod} showPaymentMethods={false} error={err} />
      )}
    </div>
  );
}

/* ---------------- Sections ---------------- */

function TopBar({ store, code, now }) {
  return (
    <div className="shrink-0 sticky top-0 z-40 border-b border-white/10 backdrop-blur px-6 py-4 flex items-center justify-between" style={{ backgroundColor: `${store?.display_card_color || "#161920"}CC` }}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center overflow-hidden">
          {store?.logo_url
            ? <img src={store.logo_url} alt="logo" className="w-full h-full object-cover" />
            : <Store className="w-6 h-6 text-primary" />}
        </div>
        <div>
          <div className="font-heading font-extrabold text-2xl tracking-tight leading-none">{store?.name || "RizPOS"}</div>
          <div className="text-xs text-white/60 mt-1">{store?.tagline || "Point of Sale"}</div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Session</div>
          <div className="font-mono font-bold text-primary text-lg">{code}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Waktu</div>
          <div className="font-mono font-bold text-2xl lg:text-3xl leading-none mt-1">
            {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  );
}

function IdleScreen({ store, code }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mb-6">
        <ShoppingCart className="w-12 h-12 text-primary" />
      </div>
      <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">{store?.display_welcome || "Selamat Datang"}</div>
      <h1 className="font-heading text-5xl lg:text-6xl font-extrabold mt-3">di {store?.name || "RizPOS"}</h1>
      <p className="text-white/60 text-lg mt-4 max-w-md">
        Silakan tunggu, kasir sedang menginput belanjaan Anda. Layar ini akan otomatis menampilkan detail pesanan Anda.
      </p>
      <div className="mt-10 flex items-center gap-3 text-white/40 text-sm">
        <Sparkles className="w-4 h-4" />
        <span>Session</span>
        <span className="font-mono text-white/80 font-bold">{code}</span>
      </div>
    </div>
  );
}

function CheckoutScreen({ state, busy, onPick, showPaymentMethods = true, error }) {
  const configuredMethods = (state.store?.payment_methods || state.payment_methods || []).filter((m) => m.enabled !== false);
  const methods = configuredMethods.length > 0 ? configuredMethods.map(toDisplayMethod) : METHODS;
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-6 space-y-6">
      <div
        className="shrink-0 rounded-3xl border border-primary/30 p-6 lg:p-8 shadow-2xl"
        style={{ background: "linear-gradient(135deg, var(--display-card), color-mix(in srgb, var(--display-accent) 18%, var(--display-card)))" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-primary font-semibold">Nilai Total</div>
            <div className="text-white/60 text-sm mt-2">Jumlah yang harus dibayar</div>
          </div>
          <div className="font-mono font-extrabold text-5xl lg:text-7xl text-primary tracking-tight leading-none">
            {idr(state.total)}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 flex-1 min-h-0">
      {/* Left: cart */}
      <div className={`${showPaymentMethods ? "lg:col-span-7" : "lg:col-span-12"} min-h-0 flex flex-col space-y-4`}>
        <div className="shrink-0">
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">Pesanan Anda</div>
          <h2 className="font-heading text-3xl lg:text-4xl font-extrabold mt-1">
            {state.items.length} Item
          </h2>
          {state.customer_name && <div className="text-white/60 mt-1">Untuk: {state.customer_name}</div>}
        </div>

        <div className="flex-1 min-h-0 flex flex-col border border-white/10 rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--display-card)" }}>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5">
            {state.items.map((i, idx) => (
              <div key={idx} className="p-4 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="w-11 h-11 rounded-lg bg-primary/20 text-primary font-mono font-bold flex items-center justify-center flex-shrink-0">
                  ×{i.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.name}</div>
                  <div className="text-xs text-white/50 font-mono">{idr(i.price)} / item</div>
                </div>
                <div className="font-mono font-bold text-lg">{idr(i.subtotal)}</div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/10 space-y-1.5 text-sm" style={{ backgroundColor: "rgba(0,0,0,0.28)" }}>
            <Row label="Subtotal" value={idr(state.subtotal)} />
            {state.discount > 0 && <Row label="Diskon" value={`-${idr(state.discount)}`} tone="warn" />}
            {state.tax_rate > 0 && <Row label={`Pajak (${state.tax_rate}%)`} value={idr(state.tax_amount)} />}
          </div>
        </div>
      </div>

      {/* Right: payment methods */}
      {showPaymentMethods && <div className="lg:col-span-5 min-h-0 flex flex-col space-y-4">
        <div className="shrink-0">
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">Pilih Pembayaran</div>
          <h2 className="font-heading text-3xl font-bold mt-1">Bayar dengan</h2>
          <p className="text-sm text-white/60 mt-1">Ketuk metode pembayaran yang Anda inginkan.</p>
          {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="grid grid-cols-1 gap-3">
          {methods.map((m) => (
            <button
              key={m.k}
              disabled={busy}
              onClick={() => onPick(m.id || m.k, m.k, m.channel || null)}
              data-testid={`display-pay-${m.k}`}
              className="group relative overflow-hidden text-left rounded-2xl p-5 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-all disabled:opacity-40 active:scale-[0.98]"
            >
              <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gradient-to-br ${m.color} opacity-20 group-hover:opacity-40 transition-opacity blur-2xl`} />
              <div className="relative flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl ${m.color?.startsWith("#") ? "" : `bg-gradient-to-br ${m.color}`} flex items-center justify-center shadow-lg`} style={m.color?.startsWith("#") ? { backgroundColor: m.color } : undefined}>
                  <m.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-heading font-bold text-xl">{m.label}</div>
                  <div className="text-sm text-white/50">{m.desc}</div>
                </div>
                <div className="text-white/40 group-hover:text-primary transition-colors text-2xl">→</div>
              </div>
            </button>
            ))}
          </div>
        </div>
      </div>
      }
      </div>
    </div>
  );
}

function toDisplayMethod(method) {
  const iconByName = { wallet: Wallet, "credit-card": CreditCard, "qr-code": QrCode, building: Building2 };
  const kind = method.kind === "qris_static" ? "qris" : method.kind;
  const defaults = {
    cash: { label: "Tunai", desc: "Bayar langsung ke kasir", icon: Wallet, color: "from-emerald-500 to-emerald-600" },
    card: { label: "Kartu Debit/Kredit", desc: "Tap / gesek di mesin EDC", icon: CreditCard, color: "from-blue-500 to-blue-600" },
    qris: { label: "QRIS", desc: "Scan dengan mobile banking atau e-wallet", icon: QrCode, color: "from-fuchsia-500 to-purple-600" },
    midtrans: { label: "Pembayaran Online", desc: "Kartu / QRIS / VA / e-wallet", icon: CreditCard, color: "from-cyan-500 to-teal-600" },
    tripay: { label: "Pembayaran Online", desc: "VA / retail / QRIS / e-wallet", icon: Building2, color: "from-orange-500 to-red-500" },
  };
  return { ...defaults[kind], ...method, k: kind, icon: iconByName[method.icon] || defaults[kind]?.icon || Wallet };
}

function AwaitingPayment({ state, onBack }) {
  const pi = state.payment_intent || {};
  const gw = pi.gateway;
  return (
    <div className="grid lg:grid-cols-12 gap-6 p-6">
      <div className="lg:col-span-5 space-y-4">
        <button onClick={onBack} className="text-sm text-white/60 hover:text-white flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Pilih metode lain
        </button>
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">Total Bayar</div>
          <div className="font-mono font-extrabold text-5xl lg:text-6xl text-primary mt-2">{idr(state.total)}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm space-y-1.5">
          {state.items.slice(0, 8).map((i, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-white/70 truncate mr-2">{i.quantity}× {i.name}</span>
              <span className="font-mono">{idr(i.subtotal)}</span>
            </div>
          ))}
          {state.items.length > 8 && <div className="text-xs text-white/40">+ {state.items.length - 8} item lainnya</div>}
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          {gw === "cash" && <SimpleInstruction icon={Wallet} title="Bayar Tunai" text="Silakan serahkan uang tunai ke kasir. Kasir akan menekan tombol konfirmasi setelah menerima pembayaran." />}
          {gw === "card" && <SimpleInstruction icon={CreditCard} title="Pembayaran Kartu" text="Tap atau gesek kartu Anda pada mesin EDC di kasir." />}
          {gw === "qris" && <SimpleInstruction icon={QrCode} title="QRIS" text="Scan QRIS statis di kasir menggunakan aplikasi mobile banking atau e-wallet Anda." />}
          {gw === "midtrans" && <MidtransView pi={pi} />}
          {gw === "tripay" && <TripayView pi={pi} />}
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-white/50 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Menunggu konfirmasi pembayaran…
        </div>
      </div>
    </div>
  );
}

function SimpleInstruction({ icon: Icon, title, text }) {
  return (
    <div className="text-center py-10">
      <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-6">
        <Icon className="w-10 h-10 text-primary" />
      </div>
      <h3 className="font-heading text-3xl font-bold">{title}</h3>
      <p className="text-white/60 mt-3 max-w-md mx-auto">{text}</p>
    </div>
  );
}

function MidtransView({ pi }) {
  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
        <CreditCard className="w-8 h-8 text-cyan-400" />
      </div>
      <h3 className="font-heading text-2xl font-bold">Midtrans Snap</h3>
      <p className="text-white/60 mt-2 text-sm">Popup pembayaran otomatis terbuka di layar ini.</p>
      {pi.redirect_url && (
        <a href={pi.redirect_url} target="_blank" rel="noreferrer"
          className="inline-block mt-6 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 font-semibold transition-colors">
          Buka Halaman Pembayaran
        </a>
      )}
      <div className="mt-4 text-xs text-white/40 font-mono">Order ID: {pi.order_id}</div>
    </div>
  );
}

function TripayView({ pi }) {
  const copy = (t) => { navigator.clipboard.writeText(t || ""); };
  return (
    <div className="grid md:grid-cols-2 gap-6 items-center">
      <div className="text-center">
        {pi.qr_url ? (
          <div className="inline-block p-4 rounded-2xl bg-white">
            <img src={pi.qr_url} alt="QR" className="w-56 h-56" />
          </div>
        ) : (
          <div className="w-56 h-56 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <QrCode className="w-20 h-20 text-white/30" />
          </div>
        )}
        <div className="mt-3 text-xs text-white/40 font-mono">{pi.reference}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-primary font-semibold">{pi.channel}</div>
        <h3 className="font-heading text-2xl font-bold mt-1">Instruksi Pembayaran</h3>
        {pi.pay_code && (
          <button onClick={() => copy(pi.pay_code)}
            className="mt-3 w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors">
            <span className="text-xs uppercase text-white/50">Kode Bayar</span>
            <span className="font-mono font-bold text-lg">{pi.pay_code}</span>
            <Copy className="w-4 h-4 text-white/40" />
          </button>
        )}
        <div className="mt-4 space-y-2 text-sm text-white/70 max-h-56 overflow-y-auto pr-2">
          {(pi.instructions || []).map((ins, idx) => (
            <div key={idx}>
              <div className="text-primary font-semibold text-xs uppercase tracking-wider">{ins.title}</div>
              <ol className="list-decimal list-inside space-y-0.5 mt-1">
                {(ins.steps || []).map((s, i) => <li key={i} className="text-xs">{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
        {pi.checkout_url && (
          <a href={pi.checkout_url} target="_blank" rel="noreferrer"
            className="inline-block mt-4 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 font-semibold transition-colors">
            Buka di Browser
          </a>
        )}
      </div>
    </div>
  );
}

function PaidScreen({ state }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-3xl animate-pulse" />
        <div className="relative w-28 h-28 rounded-full bg-emerald-500 flex items-center justify-center">
          <CheckCircle2 className="w-16 h-16 text-white" />
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 font-semibold mt-8">Pembayaran Berhasil</div>
      <h1 className="font-heading text-5xl lg:text-6xl font-extrabold mt-3">Terima Kasih! 🎉</h1>
      <p className="text-white/60 text-lg mt-3 max-w-md">
        Total <span className="font-mono font-bold text-white">{idr(state.total)}</span> berhasil diterima.
      </p>
      <p className="text-white/40 text-sm mt-6">Datang kembali ya! Layar akan kembali ke tampilan awal…</p>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span className={`font-mono ${tone === "warn" ? "text-yellow-400" : ""}`}>{value}</span>
    </div>
  );
}

function Confetti({ active }) {
  const pieces = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2,
      color: ["#F97316", "#10B981", "#06B6D4", "#F59E0B", "#EC4899"][i % 5],
    })),
    []
  );
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 w-2 h-3 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animation: `fall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  );
}
