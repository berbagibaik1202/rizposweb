import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { DollarSign, ShoppingBag, Users, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import api, { formatIDR } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const COLORS = ["#F97316", "#06B6D4", "#10B981", "#F59E0B", "#EF4444"];

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/dashboard").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Pendapatan Hari Ini", value: formatIDR(data.revenue_today), icon: DollarSign, tone: "primary" },
    { label: "Transaksi Hari Ini", value: data.tx_count_today, icon: ShoppingBag, tone: "accent" },
    { label: "Rata-rata Tiket", value: formatIDR(data.avg_ticket), icon: TrendingUp, tone: "success" },
    { label: "Total Produk", value: data.total_products, icon: Package, tone: "warning" },
  ];

  const pmData = Object.entries(data.payment_split).map(([k, v]) => ({ name: k.toUpperCase(), value: v }));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">RizPOS Overview</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
            Halo, {user?.name} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan bisnis kamu hari ini.</p>
        </div>
        <Badge variant="outline" className="text-xs px-3 py-1.5">
          {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Card key={i} className="p-5 relative overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all" data-testid={`kpi-card-${i}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{c.label}</div>
                <div className="font-mono font-bold text-2xl mt-2">{c.value}</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <c.icon className="w-5 h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-lg">Tren Penjualan (7 Hari)</h3>
              <p className="text-xs text-muted-foreground">Pendapatan harian dalam Rupiah</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  formatter={(v) => formatIDR(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading font-bold text-lg">Metode Pembayaran (Hari Ini)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pmData} innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                  {pmData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatIDR(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top Products & Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-heading font-bold text-lg mb-4">Produk Terlaris</h3>
          <div className="space-y-2">
            {data.top_products.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Belum ada transaksi.</p>}
            {data.top_products.map((p, i) => (
              <div key={p.product_id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-sm">#{i + 1}</div>
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.qty} terjual</div>
                  </div>
                </div>
                <div className="font-mono font-bold text-sm">{formatIDR(p.revenue)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-warning" style={{ color: "#F59E0B" }} />
            <h3 className="font-heading font-bold text-lg">Stok Menipis</h3>
          </div>
          <div className="space-y-2">
            {data.low_stock.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Semua stok aman ✓</p>}
            {data.low_stock.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                </div>
                <Badge variant="destructive">{p.stock} {p.unit}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
