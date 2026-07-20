import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Settings, Plus, Trash2, Edit, Save, X, Upload } from 'lucide-react';
import { schoolSettings } from '../data/mockData';
import { toast } from 'sonner';
import { api, BASE_URL } from '@/lib/api';

interface ChargeCategory {
  id: number;
  name: string;
  limit: number;
  isBuiltIn: boolean;
}

export function SchoolSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState(schoolSettings);
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [cats, setCats] = useState<ChargeCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLimit, setNewCatLimit] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCatsDialog, setShowCatsDialog] = useState(false);

  // Basic Settings Form State
  const [formData, setFormData] = useState({
    name: settings.name,
    logo: settings.logo,
    academicYear: settings.academicYear,
    currentTerm: settings.currentTerm,
    motto: ''
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, cRes] = await Promise.allSettled([
          api.get('/settings'),
          api.get('/charge-categories'),
        ] as const);
        const data = sRes.status === 'fulfilled' ? sRes.value : null;
        if (data) {
          setSettings(prev => ({ ...prev, ...data }));
          setFormData({
            name: data.name || '',
            logo: data.logo || '',
            academicYear: data.academicYear || '',
            currentTerm: data.currentTerm || '',
            motto: data.motto || '',
          });
        }
        if (cRes.status === 'fulfilled') setCats(cRes.value || []);
      } catch {}
    };
    load();
  }, []);

  const handleBasicInfoSave = async () => {
    const next = { ...settings, ...formData };
    setSettings(next);
    setIsEditingBasic(false);
    try {
      await api.put('/settings', {
        name: formData.name,
        logo: formData.logo,
        academicYear: formData.academicYear,
        currentTerm: formData.currentTerm,
        motto: formData.motto,
      });
      try {
        const userStr = window.localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) {
            user.School[0].name = formData.name;
            user.School[0].logo = formData.logo;
            user.School[0].academicYear = formData.academicYear;
            user.School[0].currentTerm = formData.currentTerm;
            user.School[0].motto = formData.motto;
            window.localStorage.setItem('user', JSON.stringify(user));
          }
        }
      } catch {}
      toast.success('School information updated successfully');
    } catch {
      toast.error('Failed to save school information');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setLogoError(null);

    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
      const body = new FormData();
      body.append('file', file);
      body.append('type', 'logo');

      const res = await fetch(`${BASE_URL}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed: ${res.status}`);
      }

      const { path } = await res.json();

      // Persist the path to the database
      await api.put('/settings', { logo: path });

      // Sync localStorage so Sidebar/Dashboard/PDF pick up the new path
      try {
        const userStr = window.localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) {
            user.School[0].logo = path;
            window.localStorage.setItem('user', JSON.stringify(user));
          }
        }
      } catch {}

      // Update local state so the stored path reflects immediately
      setSettings(prev => ({ ...prev, logo: path }));
      setFormData(prev => ({ ...prev, logo: path }));

      toast.success('Logo uploaded successfully');
    } catch (err: any) {
      const msg = err?.message || 'Upload failed';
      setLogoError(msg);
      toast.error('Logo upload failed');
    } finally {
      setLogoUploading(false);
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
    }
  };

  const handleSaveEdit = async (cat: ChargeCategory) => {
    setEditError(null);
    try {
      await api.put(`/charge-categories/${cat.id}`, {
        ...(!cat.isBuiltIn && editName.trim() !== cat.name ? { name: editName.trim() } : {}),
        limit: parseInt(editLimit) || 0,
      });
      setEditingId(null);
      const fresh = await api.get('/charge-categories');
      setCats(fresh || []);
    } catch (e: any) {
      setEditError(e.message || 'Failed to update');
    }
  };

  const handleDeleteCat = async (cat: ChargeCategory) => {
    if (!confirm(`Remove "${cat.name}"?`)) return;
    try {
      await api.delete(`/charge-categories/${cat.id}`);
      setCats(prev => prev.filter(c => c.id !== cat.id));
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete category');
    }
  };

  const handleAddCat = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.post('/charge-categories', { name, limit: parseInt(newCatLimit) || 0 });
      setNewCatName('');
      setNewCatLimit('');
      const fresh = await api.get('/charge-categories');
      setCats(fresh || []);
    } catch (e: any) {
      setAddError(e.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-8 school-settings">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">School Settings</h1>
        <p className="text-gray-600">Manage school information and curriculum</p>
      </div>

      {/* Basic Information Card */}
      <Card className="p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl">Basic Information</h2>
          <Button
            onClick={() => {
              if (isEditingBasic) {
                handleBasicInfoSave();
              } else {
                setIsEditingBasic(true);
              }
            }}
            variant={isEditingBasic ? "default" : "outline"}
          >
            {isEditingBasic ? (
              <>
                <Save className="mr-2" size={16} />
                Save Changes
              </>
            ) : (
              <>
                <Edit className="mr-2" size={16} />
                Edit
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>School Name</Label>
            {isEditingBasic ? (
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter school name"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{settings.name}</p>
            )}
          </div>

          <div>
            <Label>School Motto <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
            {isEditingBasic ? (
              <Input
                value={formData.motto}
                onChange={(e) => setFormData(prev => ({ ...prev, motto: e.target.value }))}
                placeholder="e.g. Excellence in Education"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{(settings as any).motto || '—'}</p>
            )}
          </div>

          <div>
            <Label>Academic Year</Label>
            {isEditingBasic ? (
              <Input
                value={formData.academicYear}
                onChange={(e) => setFormData(prev => ({ ...prev, academicYear: e.target.value }))}
                placeholder="e.g., 2024/2025"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{settings.academicYear}</p>
            )}
          </div>

          <div>
            <Label>Current Term</Label>
            {isEditingBasic ? (
              <Input
                value={formData.currentTerm}
                onChange={(e) => setFormData(prev => ({ ...prev, currentTerm: e.target.value }))}
                placeholder="e.g., Term 1"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{settings.currentTerm}</p>
            )}
          </div>

          <div>
            <Label>School Logo</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3">
                <label
                  className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors${logoUploading ? ' opacity-50 pointer-events-none' : ''}`}
                >
                  <Upload size={14} />
                  {logoUploading ? 'Uploading…' : 'Choose image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>
                <span className="text-xs text-gray-400">JPG, PNG or WebP · max 5 MB</span>
              </div>
              {logoError && (
                <p className="text-sm text-red-600">{logoError}</p>
              )}
              {settings.logo && (
                <p className="text-xs text-gray-500 break-all">{settings.logo}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Charge Categories */}
      <Card className="p-6 mt-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl">Fees Categories</h2>
            <p className="text-sm text-gray-500 mt-1">
              {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} configured
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowCatsDialog(true)}>
            <Settings className="mr-2" size={16} />
            Manage Categories
          </Button>
        </div>
      </Card>

      {/* Logout */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Button
          variant="destructive"
          onClick={() => {
            try {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("auth_token");
                window.localStorage.removeItem("user");
                router.replace("/login");
              }
            } catch {}
          }}
        >
          Logout
        </Button>
      </div>

      {/* Charge Categories Dialog */}
      <Dialog
        open={showCatsDialog}
        onOpenChange={(open) => { setShowCatsDialog(open); if (!open) { setEditingId(null); setEditError(null); } }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Charge Categories</DialogTitle>
            <DialogDescription>
              Manage charge categories. Built-in categories cannot be renamed or deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {cats.length === 0 && (
              <p className="text-sm text-gray-500">No categories yet. Run the seed script to add built-in categories.</p>
            )}
            {cats.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                {editingId === cat.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      disabled={cat.isBuiltIn}
                      className="flex-1"
                      placeholder="Category name"
                    />
                    <Input
                      type="number"
                      min="0"
                      value={editLimit}
                      onChange={e => setEditLimit(e.target.value)}
                      className="w-36"
                      placeholder="Limit (FCFA)"
                    />
                    {editError && <p className="text-xs text-red-600 whitespace-nowrap">{editError}</p>}
                    <Button size="sm" onClick={() => handleSaveEdit(cat)}>
                      <Save size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditError(null); }}>
                      <X size={14} />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-medium text-sm">{cat.name}</span>
                      {cat.isBuiltIn && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          built-in
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {cat.limit > 0 ? `Limit: ${cat.limit.toLocaleString()} FCFA` : 'No limit'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditName(cat.name);
                        setEditLimit(cat.limit > 0 ? String(cat.limit) : '');
                        setEditError(null);
                      }}
                    >
                      <Edit size={14} />
                    </Button>
                    {!cat.isBuiltIn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteCat(cat)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Add Category</p>
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="e.g. Library Fee"
                  className="w-48"
                />
              </div>
              <div>
                <Label className="text-xs">
                  Limit (FCFA) <span className="text-gray-400 font-normal">optional</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={newCatLimit}
                  onChange={e => setNewCatLimit(e.target.value)}
                  placeholder="0 = none"
                  className="w-36"
                />
              </div>
              <Button onClick={handleAddCat} disabled={adding || !newCatName.trim()}>
                <Plus size={14} className="mr-1" />
                Add
              </Button>
            </div>
            {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
