import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings, Plus, Trash2, Edit, Save, X, Upload } from 'lucide-react';
import { schoolSettings } from '../data/mockData';
import { SubjectConfig } from '../types';
import { toast } from 'sonner';
import { api, BASE_URL } from '@/lib/api';

export function SchoolSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState(schoolSettings);
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [isEditingSubjects, setIsEditingSubjects] = useState(false);
  const [selectedClass, setSelectedClass] = useState<SubjectConfig | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Basic Settings Form State
  const [formData, setFormData] = useState({
    name: settings.name,
    logo: settings.logo,
    academicYear: settings.academicYear,
    currentTerm: settings.currentTerm
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, cRes] = await Promise.allSettled([
          api.get('/settings'),
          api.get('/fee-categories')
        ] as const);
        const data = sRes.status === 'fulfilled' ? sRes.value : {} as any;
        const cats = cRes.status === 'fulfilled' ? cRes.value : [] as any[];
        if (data) {
          // Ensure default fee categories exist (Tuition & Registration only)
          const defaults = [
            { name: 'Tuition Fee', limit: 0 },
            { name: 'Registration Fee', limit: 0 },
          ];
          const existing = ((cats || []) as any[]).map((c:any)=> ({ name: c.name, limit: Number(c.limit)||0 }));
          const normalized = existing.map((c:any)=> typeof c === 'string' ? { name: c, limit: 0 } : c);
          const merged = defaults.reduce((arr, d) => {
            const has = arr.some((c:any)=> String(c.name).toLowerCase() === d.name.toLowerCase());
            return has ? arr : [...arr, d];
          }, normalized as any[]);
          const nextSettings = { ...data, feesCategories: merged };
          setSettings(nextSettings);
          setFormData({
            name: data.name || '',
            logo: data.logo || '',
            academicYear: data.academicYear || '',
            currentTerm: data.currentTerm || ''
          });
          // persist merge if we added defaults
          if (cRes.status === 'fulfilled' && merged.length !== normalized.length) {
            try { await Promise.all(merged
              .filter((m:any)=> !normalized.some((n:any)=> String(n.name).toLowerCase()===String(m.name).toLowerCase()))
              .map((m:any)=> api.post('/fee-categories', { name: m.name, limit: m.limit }))
            ); } catch {}
          }
        }
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
            window.localStorage.setItem('user', JSON.stringify(user));
          }
        }
      } catch {}
      toast.success('School information updated successfully');
    } catch {
      toast.error('Failed to save school information');
    }
  };

  const handleAddSubject = async () => {
    if (!selectedClass || !newSubject.trim()) return;

    const updatedSubjects = settings.subjectsPerClass.map(sc => {
      if (sc.id === selectedClass.id) {
        return {
          ...sc,
          subjects: [...sc.subjects, newSubject.trim()]
        };
      }
      return sc;
    });

    const next = { ...settings, subjectsPerClass: updatedSubjects };
    setSettings(next);

    setNewSubject('');
    try {
      await api.put('/settings', { subjectsPerClass: updatedSubjects });
      toast.success('Subject added successfully');
    } catch {
      toast.error('Failed to add subject');
    }
  };

  const handleRemoveSubject = async (classId: string, subjectToRemove: string) => {
    const updatedSubjects = settings.subjectsPerClass.map(sc => {
      if (sc.id === classId) {
        return {
          ...sc,
          subjects: sc.subjects.filter(s => s !== subjectToRemove)
        };
      }
      return sc;
    });

    const next = { ...settings, subjectsPerClass: updatedSubjects };
    setSettings(next);
    try {
      await api.put('/settings', { subjectsPerClass: updatedSubjects });
      toast.success('Subject removed successfully');
    } catch {
      toast.error('Failed to remove subject');
    }
  };

  const handleAddClass = async () => {
    const newClassName = prompt('Enter new class name:');
    if (!newClassName) return;

    const newClass: SubjectConfig = {
      id: `SC${String(settings.subjectsPerClass.length + 1).padStart(3, '0')}`,
      className: newClassName,
      subjects: []
    };

    const updated = [...settings.subjectsPerClass, newClass];
    setSettings(prev => ({ ...prev, subjectsPerClass: updated }));
    try {
      await api.put('/settings', { subjectsPerClass: updated });
      toast.success('Class added successfully');
    } catch {
      toast.error('Failed to add class');
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

  const handleRemoveClass = async (classId: string) => {
    if (!confirm('Are you sure you want to remove this class?')) return;

    const updated = settings.subjectsPerClass.filter(sc => sc.id !== classId);
    setSettings(prev => ({ ...prev, subjectsPerClass: updated }));
    try {
      await api.put('/settings', { subjectsPerClass: updated });
      toast.success('Class removed successfully');
    } catch {
      toast.error('Failed to remove class');
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

      {/* Fee Categories (simple) */}
      <Card className="p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl">Fee Categories</h2>
          <Button
            onClick={async ()=>{
              const label = prompt('Enter new category name');
              const name = String(label||'').trim();
              if (!name) return;
              const current = (settings as any).feesCategories || [];
              const normalized = current.map((c:any)=> typeof c==='string'? { name: c, limit: 0 } : c);
              if (normalized.some((c:any)=> String(c.name).toLowerCase()===name.toLowerCase())) return;
              try { await api.post('/fee-categories', { name, limit: 0 }); } catch {}
              try {
                const fresh = await api.get('/fee-categories');
                const nextCats = ((fresh||[]) as any[]).map((c:any)=> ({ name: c.name, limit: Number(c.limit)||0 }));
                setSettings((prev:any)=> ({ ...prev, feesCategories: nextCats, __selCat: name, __selLimit: '0' }));
              } catch {
                const nextCats = [...normalized, { name, limit: 0 }];
                const nextSettings = { ...(settings as any), feesCategories: nextCats };
                setSettings({ ...nextSettings, __selCat: name, __selLimit: '0' });
              }
            }}
          >
            Add Category
          </Button>
        </div>
        <div className="space-y-3">
          {/* Single dropdown to select category and edit/remove */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1 min-w-[260px]">
              <Label>Select Category</Label>
              <Select
                value={(settings as any).__selCat || ''}
                onValueChange={(v:string)=> {
                  const current = (settings as any).feesCategories || [];
                  const normalized = current.map((c:any)=> typeof c==='string'? { name: c, limit: 0 } : c);
                  const found = normalized.find((c:any)=> c.name===v);
                  setSettings((prev:any)=> ({ ...prev, __selCat: v, __selLimit: String(found?.limit ?? '') }));
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {(((settings as any).feesCategories||[]) as any[])
                    .map((c:any)=> typeof c==='string'? c : c.name)
                    .map((n:string)=> (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Limit (FCFA)</Label>
              <Input
                type="number"
                placeholder="0"
                value={(settings as any).__selLimit || ''}
                onChange={(e)=> setSettings((prev:any)=> ({ ...prev, __selLimit: e.target.value }))}
                className="w-40"
              />
            </div>
            {(() => {
              const name = String((settings as any).__selCat||'');
              const entered = String((settings as any).__selLimit ?? '');
              const current = (settings as any).feesCategories || [];
              const normalized = current.map((c:any)=> typeof c==='string'? { name: c, limit: 0 } : c);
              const found = normalized.find((c:any)=> c.name === name);
              const stored = found ? String(found.limit ?? '') : '';
              const dirty = !!name && stored !== entered;
              if (!dirty) return null;
              return (
                <Button onClick={async ()=>{
                  const limit = Number((settings as any).__selLimit||0) || 0;
                  try { await api.put('/fee-categories/upsert', { name, limit }); } catch {}
                  try {
                    const fresh = await api.get('/fee-categories');
                    const nextCats = ((fresh||[]) as any[]).map((c:any)=> ({ name: c.name, limit: Number(c.limit)||0 }));
                    setSettings((prev:any)=> ({ ...prev, feesCategories: nextCats, __selLimit: String(limit) }));
                  } catch {
                    const nextCats = normalized.map((c:any)=> c.name===name ? { ...c, limit } : c);
                    const nextSettings = { ...(settings as any), feesCategories: nextCats };
                    setSettings(nextSettings);
                  }
                }}>
                  Set Limit
                </Button>
              );
            })()}
            {(settings as any).__selCat ? (
            <Button
              variant="ghost"
              className="text-red-500"
              onClick={async ()=>{
                const name = String((settings as any).__selCat||'');
                if (!name) return;
                const current = (settings as any).feesCategories || [];
                const normalized = current.map((c:any)=> typeof c==='string'? { name: c, limit: 0 } : c);
                const nextCats = normalized.filter((c:any)=> c.name !== name);
                try { await api.delete(`/fee-categories/by-name/${encodeURIComponent(name)}`); } catch {}
                try {
                  const fresh = await api.get('/fee-categories');
                  const latest = ((fresh||[]) as any[]).map((c:any)=> ({ name: c.name, limit: Number(c.limit)||0 }));
                  setSettings((prev:any)=> ({ ...prev, feesCategories: latest, __selCat: '', __selLimit: '' }));
                } catch {
                  const nextSettings = { ...(settings as any), feesCategories: nextCats };
                  setSettings({ ...nextSettings, __selCat: '', __selLimit: '' });
                }
              }}
            >
              Remove Category
            </Button>
            ) : null}
          </div>

          
        </div>
      </Card>

      {/* Subjects Per Class Card */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl">Subjects Per Class</h2>
          <Button onClick={handleAddClass}>
            <Plus className="mr-2" size={16} />
            Add Class
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {settings.subjectsPerClass.map((classConfig) => (
            <Card key={classConfig.id} className="p-4 border-2">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">{classConfig.className}</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedClass(classConfig);
                      setIsEditingSubjects(true);
                    }}
                  >
                    <Edit size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveClass(classConfig.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {classConfig.subjects.length > 0 ? (
                  <Select>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`${classConfig.subjects.length} subjects configured`} />
                    </SelectTrigger>
                    <SelectContent>
                      {classConfig.subjects.map((subject, idx) => (
                        <SelectItem key={idx} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-gray-500 italic">No subjects configured</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Total: {classConfig.subjects.length} subjects
                </p>
              </div>
            </Card>
          ))}
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

      {/* Edit Subjects Dialog */}
      <Dialog open={isEditingSubjects} onOpenChange={setIsEditingSubjects}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Subjects - {selectedClass?.className}</DialogTitle>
            <DialogDescription>
              Add or remove subjects for this class. Click on a subject to select it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add New Subject */}
            <div>
              <Label>Add New Subject</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Enter subject name"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddSubject();
                    }
                  }}
                />
                <Button onClick={handleAddSubject}>
                  <Plus size={16} className="mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Subjects Dropdown (View) */}
            <div>
              <Label>All Subjects ({selectedClass?.subjects.length || 0})</Label>
              {selectedClass && selectedClass.subjects.length > 0 ? (
                <Select>
                  <SelectTrigger className="w-full mt-2">
                    <SelectValue placeholder="Select a subject to view" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedClass.subjects.map((subject, idx) => (
                      <SelectItem key={idx} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-gray-500 italic mt-2">No subjects configured yet</p>
              )}
            </div>

            {/* Subject List with Remove Options */}
            <div>
              <Label>Edit Subjects</Label>
              <div className="space-y-2 max-h-80 overflow-y-auto mt-2 border rounded-lg p-3 bg-gray-50">
                {selectedClass && selectedClass.subjects.length > 0 ? (
                  selectedClass.subjects.map((subject, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-3 bg-white rounded border hover:border-blue-300 transition-colors"
                    >
                      <span>{subject}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveSubject(selectedClass.id, subject)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <X size={16} className="mr-1" />
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No subjects yet. Add your first subject above.
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
