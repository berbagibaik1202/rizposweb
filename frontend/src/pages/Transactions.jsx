import { useEffect, useState } from "react";
import { Eye, Printer, Wallet, CreditCard, QrCode } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api, { formatIDR, formatDate } from "../lib/api";
import { printReceipt } from "../lib/printReceipt";
import Receipt from "../components/Receipt";

const pmIcon = { cash: Wallet, card: CreditCard, qris: QrCode };

export default function Transactions() {
  const [items, setItems] = useState([]);
  const [pm, setPm] = useState("all");
  const [sel, setSel] = useState(null);

  const load = () => {
    const params = {};
    if (pm !== "all") params.payment_method = pm;
    api.get("/transactions", { params }).then((r) => setItems(r.data));
  };
  useEffect(load, [pm]);

  return (
    <div className="space-y-6" data-testid="transactions-page">
      <div>
        <h1 className="font-heading text-3xl font-bold">Transaksi</h1>
        <p className="text-sm text-muted-foreground">Riwayat semua transaksi.</p>
      </div>

      <div className="flex gap-3">
        <Select value={pm} onValueChange={setPm}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Metode</SelectItem>
            <SelectItem value="cash">Tunai</SelectItem>
            <SelectItem value="card">Kartu</SelectItem>
            <SelectItem value="qris">QRIS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Struk</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Kasir</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => {
              const Icon = pmIcon[t.payment_method] || Wallet;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.receipt_no}</TableCell>
                  <TableCell className="text-sm">{formatDate(t.created_at)}</TableCell>
                  <TableCell className="text-sm">{t.cashier_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase gap-1"><Icon className="w-3 h-3" />{t.payment_method}</Badge>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{t.items.length}</Badge></TableCell>
                  <TableCell className="font-mono font-bold">{formatIDR(t.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSel(t)} data-testid={`view-tx-${t.receipt_no}`}><Eye className="w-4 h-4 mr-1" />Detail</Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada transaksi.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="p-4 pb-2"><DialogTitle>Detail Transaksi</DialogTitle></DialogHeader>
          {sel && <Receipt tx={sel} />}
          <div className="p-4 pt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setSel(null)}>Tutup</Button>
            <Button onClick={() => printReceipt("rizpos-receipt")}><Printer className="w-4 h-4 mr-2" />Cetak</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
