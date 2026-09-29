import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Store, LayoutDashboard, ShoppingCart, Package, Tag, Users, Receipt, BarChart3, UserCog, LogOut, Menu, X, Settings as SettingsIcon
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { Button } from "../components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/cashier", label: "Kasir", icon: ShoppingCart },
  { to: "/products", label: "Produk", icon: Package },
  { to: "/categories", label: "Kategori", icon: Tag },
  { to: "/customers", label: "Pelanggan", icon: Users },
  { to: "/transactions", label: "Transaksi", icon: Receipt },
  { to: "/reports", label: "Laporan", icon: BarChart3 },
  { to: "/users", label: "Pengguna", icon: UserCog, adminOnly: true },
  { to: "/settings", label: "Pengaturan", icon: SettingsIcon, adminOnly: true },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { settings } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const items = nav.filter((n) => !n.adminOnly || user?.role === "admin");

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 border-b bg-background/95 backdrop-blur flex items-center justify-between px-4">
        <button onClick={() => setOpen(!open)} className="p-2" data-testid="mobile-menu-toggle">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center"><Store className="w-4 h-4 text-white" /></div>
          <span className="font-heading font-bold">RizPOS</span>
        </div>
        <div className="w-8" />
      </div>

      {/* Sidebar */}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 left-0 z-50 h-screen w-64 border-r bg-card flex flex-col transition-transform`}>
        <div className="h-16 flex items-center gap-3 px-5 border-b">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 overflow-hidden">
            {settings?.logo_url
              ? <img src={settings.logo_url} alt="logo" className="w-full h-full object-cover" />
              : <Store className="w-5 h-5 text-white" />}
          </div>
          <div>
            <div className="font-heading font-extrabold tracking-tight leading-none">{settings?.name || "RizPOS"}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{settings?.tagline || "Point of Sale"}</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={() => setOpen(false)}
              data-testid={`nav-${it.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{user?.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-button">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>

      {open && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}
