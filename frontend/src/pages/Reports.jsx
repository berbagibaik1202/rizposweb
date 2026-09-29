import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api, { formatIDR } from "../lib/api";

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);

  const load = () => {
    api.get("/reports/sales", { params: { date_from: from, date_to: to } }).then((r) => setData(r.data));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="font-heading text-3xl font-bold">Laporan</h1>
        <p className="text-sm text-muted-foreground">Analisis penjualan berdasarkan periode.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div><Label>Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div>
        <div><Label>Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
        <Button onClick={load} data-testid="apply-report-filter">Terapkan</Button>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5"><div className="text-xs uppercase text-muted-foreground font-semibold">Total Pendapatan</div><div className="font-mono font-bold text-2xl mt-2 text-primary">{formatIDR(data.total_revenue)}</div></Card>
            <Card className="p-5"><div className="text-xs uppercase text-muted-foreground font-semibold">Total Transaksi</div><div className="font-mono font-bold text-2xl mt-2">{data.total_tx}</div></Card>
            <Card className="p-5"><div className="text-xs uppercase text-muted-foreground font-semibold">Total Item Terjual</div><div className="font-mono font-bold text-2xl mt-2">{data.total_items}</div></Card>
          </div>

          <Card className="p-5">
            <h3 className="font-heading font-bold text-lg mb-4">Pendapatan per Kategori</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_category}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                  <Tooltip formatter={(v) => formatIDR(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                  <Bar dataKey="revenue" fill="#F97316" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <div className="p-4"><h3 className="font-heading font-bold text-lg">Top Produk</h3></div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead>Qty Terjual</TableHead>
                  <TableHead>Pendapatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_product.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline" className="font-mono">#{i + 1}</Badge></TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono">{p.qty}</TableCell>
                    <TableCell className="font-mono font-bold">{formatIDR(p.revenue)}</TableCell>
                  </TableRow>
                ))}
                {data.by_product.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Belum ada data.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
