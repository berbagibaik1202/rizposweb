import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit, Trash2, UserCog } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Switch } from "../components/ui/switch";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Users() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/users").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => { setForm({ name: "", email: "", password: "", role: "cashier" }); setEditId(null); setOpen(true); };
  const startEdit = (u) => { setForm({ name: u.name, email: u.email, password: "", role: u.role }); setEditId(u.id); setOpen(true); };

  const submit = async () => {
    try {
      if (editId) {
        const payload = { name: form.name, role: form.role };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editId}`, payload);
      } else {
        await api.post("/users", form);
      }
      toast.success("Tersimpan");
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggle = async (u) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    load();
  };

  const del = async (id) => {
    if (!confirm("Hapus pengguna?")) return;
    try { await api.delete(`/users/${id}`); load(); } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Kelola akun admin & kasir.</p>
        </div>
        <Button onClick={startAdd} data-testid="add-user"><Plus className="w-4 h-4 mr-2" />Tambah Pengguna</Button>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center">{u.name[0]?.toUpperCase()}</div>
                    <div className="font-medium">{u.name}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="uppercase">
                    <UserCog className="w-3 h-3 mr-1" />{u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch checked={u.active !== false} onCheckedChange={() => toggle(u)} disabled={u.id === user.id} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(u)}><Edit className="w-4 h-4" /></Button>
                  {u.id !== user.id && <Button size="icon" variant="ghost" onClick={() => del(u.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Pengguna" : "Tambah Pengguna"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editId} data-testid="user-email" /></div>
            <div><Label>Password {editId && "(kosongkan jika tidak diubah)"}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password" /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Kasir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={submit} className="w-full" data-testid="save-user">Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
