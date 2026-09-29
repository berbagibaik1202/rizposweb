import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Store, Zap, TrendingUp, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email.trim(), password);
      toast.success("Selamat datang di RizPOS");
      nav("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const quickFill = (role) => {
    if (role === "admin") {
      setEmail("nanaperm12@gmail.com");
      setPassword("admin123");
    } else {
      setEmail("cashier@rizpos.id");
      setPassword("cashier123");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-5 bg-background">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:col-span-3 relative overflow-hidden bg-[#0F1115] text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="font-heading text-2xl font-extrabold tracking-tight">RizPOS</div>
            <div className="text-xs text-white/60 -mt-0.5">Point of Sale System</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="font-heading text-4xl xl:text-5xl font-extrabold leading-tight">
            Kasir Modern.<br/>
            <span className="text-primary">Cepat.</span> <span className="text-accent">Presisi.</span>
          </h1>
          <p className="text-white/70 max-w-md leading-relaxed">
            Satu sistem untuk semua jenis bisnis — retail, cafe, restoran. Transaksi kilat, laporan real-time, kontrol stok penuh.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {[
              { icon: Zap, k: "< 5 detik", v: "per transaksi" },
              { icon: TrendingUp, k: "Real-time", v: "laporan sales" },
              { icon: ShieldCheck, k: "Multi-role", v: "admin & kasir" },
            ].map((f, i) => (
              <div key={i} className="glass rounded-xl p-4 border border-white/10">
                <f.icon className="w-5 h-5 text-primary mb-2" />
                <div className="font-heading font-bold text-sm">{f.k}</div>
                <div className="text-xs text-white/60">{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/40">© 2026 RizPOS. Tactical POS for modern merchants.</div>
      </div>

      {/* Right Form */}
      <div className="lg:col-span-2 flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-md space-y-6" data-testid="login-form">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="font-heading text-xl font-extrabold">RizPOS</div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Masuk</div>
            <h2 className="font-heading text-3xl font-bold">Selamat Datang Kembali</h2>
            <p className="text-sm text-muted-foreground mt-2">Masuk untuk membuka kasir & dashboard.</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@toko.id"
                className="mt-1.5 h-11"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="mt-1.5 h-11"
                data-testid="login-password-input"
              />
            </div>
          </div>

          <Button type="submit" disabled={busy} className="w-full h-11 text-base font-semibold" data-testid="login-submit-button">
            {busy ? "Memproses…" : "Masuk"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-3 text-xs text-muted-foreground">Isi cepat demo</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => quickFill("admin")} className="h-10" data-testid="login-fill-admin">
              Admin Demo
            </Button>
            <Button type="button" variant="outline" onClick={() => quickFill("cashier")} className="h-10" data-testid="login-fill-cashier">
              Kasir Demo
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
