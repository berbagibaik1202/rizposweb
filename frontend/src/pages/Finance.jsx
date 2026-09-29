import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Plus } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api, { formatApiError, formatDate, formatIDR } from "../lib/api";

const emptyEntry = { kind: "expense", amount: "", category: "Lainnya", description: "" };

export default function Finance() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [opening, setOpening] = useState(0);
  const [openEntry, setOpenEntry] = useState(false);
  const [entry, setEntry] = useState(emptyEntry);

  const load = () => Promise.all([
    api.get("/finance", { params: { date_from: from || undefined, date_to: to || undefined } }),
    api.get("/settings"),
  ]).then(([finance, store]) => { setData(finance.data); setSettings(store.data); setOpening(store.data.opening_balance || 0); })
    .catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOpening = async () => {
    try { await api.put("/settings", { ...settings, opening_balance: Number(opening) || 0 }); toast.success("Saldo awal disimpan"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const saveEntry = async () => {
    try { await api.post("/finance/entries", { ...entry, amount: Number(entry.amount) }); toast.success("Catatan keuangan ditambahkan"); setOpenEntry(false); setEntry(emptyEntry); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="finance-page">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-heading text-3xl font-bold">Keuangan</h1><p className="text-sm text-muted-foreground">Rekap saldo awal, pemasukan, pengeluaran, dan sisa saldo.</p></div><Button onClick={() => setOpenEntry(true)}><Plus className="w-4 h-4 mr-2" />Catat Kas Manual</Button></div>
      <Card className="p-4 flex flex-wrap items-end gap-3"><div><Label>Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div><div><Label>Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div><Button onClick={load}>Terapkan</Button><div className="ml-auto flex items-end gap-2"><div><Label>Saldo Awal</Label><Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} className="mt-1 w-40" /></div><Button variant="outline" onClick={saveOpening}>Simpan Saldo</Button></div></Card>
      {data && <><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4"><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Saldo Awal</div><div className="font-mono font-bold text-xl mt-1">{formatIDR(data.opening_balance)}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Kas Masuk</div><div className="font-mono font-bold text-xl mt-1 text-emerald-600">{formatIDR(data.cash_in)}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Kas Keluar</div><div className="font-mono font-bold text-xl mt-1 text-red-600">{formatIDR(data.cash_out)}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Sisa Saldo</div><div className="font-mono font-bold text-xl mt-1 text-primary">{formatIDR(data.balance)}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Laba Penjualan</div><div className="font-mono font-bold text-xl mt-1">{formatIDR(data.profit)}</div></Card></div>
        <Card className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Jenis</TableHead><TableHead>Kategori</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Nominal</TableHead></TableRow></TableHeader><TableBody>{data.ledger.map((row) => <TableRow key={`${row.id}-${row.date}`}><TableCell className="text-sm">{formatDate(row.date)}</TableCell><TableCell><Badge variant="outline" className={row.type === "income" ? "text-emerald-600" : "text-red-600"}>{row.type === "income" ? <><ArrowUpFromLine className="w-3 h-3 mr-1 inline" />Masuk</> : <><ArrowDownToLine className="w-3 h-3 mr-1 inline" />Keluar</>}</Badge></TableCell><TableCell>{row.category}</TableCell><TableCell>{row.description}</TableCell><TableCell className={`text-right font-mono font-semibold ${row.type === "income" ? "text-emerald-600" : "text-red-600"}`}>{row.type === "income" ? "+" : "-"}{formatIDR(row.amount)}</TableCell></TableRow>)}{data.ledger.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Belum ada alur kas pada periode ini.</TableCell></TableRow>}</TableBody></Table></Card></>}

      <Dialog open={openEntry} onOpenChange={setOpenEntry}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" />Catat Kas Manual</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Jenis</Label><Select value={entry.kind} onValueChange={(v) => setEntry({ ...entry, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="income">Kas Masuk</SelectItem><SelectItem value="expense">Kas Keluar</SelectItem></SelectContent></Select></div><div><Label>Nominal</Label><Input type="number" min="1" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></div><div><Label>Kategori</Label><Input value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value })} /></div><div><Label>Keterangan</Label><Input value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></div><Button className="w-full" onClick={saveEntry}>Simpan Catatan</Button></div></DialogContent></Dialog>
    </div>
  );
}
