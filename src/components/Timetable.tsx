import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Plus, FileText, Trash2 } from "lucide-react";
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { useSchoolClassNames } from "@/lib/classes";
import { generateTimetable } from "../utils/pdfGenerator";

export function Timetable() {
  const cache = useSisCache();
  // Starts empty and settles on the school's first real class once loaded — a
  // hardcoded default (it was "Class 3") names a class that need not exist
  // here at all, which showed an empty grid for a class the school never had.
  const [selectedClass, setSelectedClass] = useState<string>("");
  const { data: staffData } = useCachedResource<any[]>('staff', () => api.get('/staff'));
  // Keyed per class, so switching back to a class already looked at paints
  // instantly instead of blanking the grid.
  const {
    data: timetableData,
    revalidating,
    error: timetableError,
    refresh: refreshTimetable,
  } = useCachedResource<any[]>(
    selectedClass ? `timetable:${selectedClass}` : null,
    () => api.get(`/timetable?class=${encodeURIComponent(selectedClass)}`),
    // Held back until a class is actually selected; without this the empty
    // initial value would fetch `?class=` and cache the result under a key
    // that belongs to no class.
    { enabled: Boolean(selectedClass), deps: [selectedClass] },
  );
  const staff = staffData ?? [];
  const timetable = timetableData ?? [];

  useResourceError(timetableError, 'the timetable', timetableData !== null);
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    cls: '',
    day: '',
    time: '',
    subject: '',
    teacher: '',
  });

  // This school's real classes — see src/lib/classes.ts.
  const { classNames: classes } = useSchoolClassNames();

  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0]);
  }, [classes, selectedClass]);
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ];
  const subjects = [
    "Mathematics",
    "English",
    "French",
    "Science",
    "Social Studies",
    "ICT",
    "Physical Education",
    "Art",
    "Music",
  ];

  const filteredTimetable = timetable.filter(
    (entry) => entry.class === selectedClass,
  );

  const handleGenerateTimetable = () => {
    generateTimetable(filteredTimetable, selectedClass);
  };

  const getTimetableByDay = (day: string) => {
    return filteredTimetable
      .filter((entry) => entry.day === day)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl mb-2">School Timetable</h1>
          <p className="text-gray-600">
            Manage class schedules and timetables <RevalidatingBadge active={revalidating} />
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus size={20} />
                Add Period
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Timetable Period</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label>Class</Label>
                  <Select value={form.cls} onValueChange={(v: string)=>setForm(s=>({...s, cls:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls} value={cls}>
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Day</Label>
                  <Select value={form.day} onValueChange={(v: string)=>setForm(s=>({...s, day:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Time</Label>
                  <Input placeholder="e.g., 08:00 - 09:00" value={form.time} onChange={e=>setForm(s=>({...s, time:e.target.value}))} />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Select value={form.subject} onValueChange={(v: string)=>setForm(s=>({...s, subject:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem
                          key={subject}
                          value={subject}
                        >
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Teacher</Label>
                  <Select value={form.teacher} onValueChange={(v: string)=>setForm(s=>({...s, teacher:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((staff: any) => (
                        <SelectItem
                          key={staff.id}
                          value={`${staff.firstName} ${staff.lastName}`}
                        >
                          {staff.firstName} {staff.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={submitting}>Cancel</Button>
                </DialogClose>
                <Button disabled={submitting} onClick={async ()=>{
                  if (submitting) return;
                  setSubmitting(true);
                  try {
                    await api.post('/timetable', {
                      day: form.day,
                      time: form.time,
                      class: form.cls,
                      subject: form.subject,
                      teacher: form.teacher,
                    });
                    // The period may have been added to a class other than the
                    // one on screen, so every class's timetable is cleared.
                    cache.invalidateOn('timetable:write');
                    await refreshTimetable();
                    setOpenAdd(false);
                    setForm({ cls:'', day:'', time:'', subject:'', teacher:'' });
                  } catch {} finally {
                    setSubmitting(false);
                  }
                }}>{submitting ? 'Adding...' : 'Add Period'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label>Select Class</Label>
            <Select
              value={selectedClass}
              onValueChange={setSelectedClass}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateTimetable}
            className="flex items-center gap-2"
          >
            <FileText size={20} />
            Generate PDF
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {days.map((day) => {
          const daySchedule = getTimetableByDay(day);

          return (
            <Card key={day} className="p-4">
              <h3 className="mb-4 pb-2 border-b">{day}</h3>
              <div className="space-y-3">
                {daySchedule.length > 0 ? (
                  daySchedule.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-gray-50 p-3 rounded text-sm"
                    >
                      <p className="text-xs text-gray-600 mb-1">
                        {entry.time}
                      </p>
                      <p className="mb-1">{entry.subject}</p>
                      <p className="text-xs text-gray-500">
                        {entry.teacher}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={14} className="mr-1" />
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No classes scheduled
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTimetable.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.day}</TableCell>
                <TableCell>{entry.time}</TableCell>
                <TableCell>{entry.subject}</TableCell>
                <TableCell>{entry.teacher}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}