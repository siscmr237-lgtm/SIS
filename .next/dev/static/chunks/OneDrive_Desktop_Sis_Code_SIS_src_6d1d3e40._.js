(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/SisCache.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SisCacheProvider",
    ()=>SisCacheProvider,
    "useSisCache",
    ()=>useSisCache
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
const SisCacheContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    get: ()=>null,
    set: ()=>{},
    invalidate: ()=>{}
});
function SisCacheProvider({ children }) {
    _s();
    const store = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const get = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SisCacheProvider.useCallback[get]": (key)=>store.current.has(key) ? store.current.get(key) : null
    }["SisCacheProvider.useCallback[get]"], []);
    const set = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SisCacheProvider.useCallback[set]": (key, data)=>{
            store.current.set(key, data);
        }
    }["SisCacheProvider.useCallback[set]"], []);
    const invalidate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "SisCacheProvider.useCallback[invalidate]": (...keys)=>{
            for (const k of keys)store.current.delete(k);
        }
    }["SisCacheProvider.useCallback[invalidate]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SisCacheProvider.useMemo[value]": ()=>({
                get,
                set,
                invalidate
            })
    }["SisCacheProvider.useMemo[value]"], [
        get,
        set,
        invalidate
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SisCacheContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/SisCache.tsx",
        lineNumber: 34,
        columnNumber: 10
    }, this);
}
_s(SisCacheProvider, "enOucLkBrVpvfHFtjE/AyDNrrT4=");
_c = SisCacheProvider;
const useSisCache = ()=>{
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(SisCacheContext);
};
_s1(useSisCache, "gDsCjeeItUuvgOWf1v4qoK9RF6k=");
var _c;
__turbopack_context__.k.register(_c, "SisCacheProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BASE_URL",
    ()=>BASE_URL,
    "api",
    ()=>api
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("OneDrive/Desktop/Sis/Code/SIS/src/lib/api.ts")}`;
    }
};
const runtimeApiUrl = typeof __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"] !== 'undefined' && ("TURBOPACK compile-time value", "http://localhost:4000") || ("TURBOPACK compile-time value", "object") !== 'undefined' && __TURBOPACK__import$2e$meta__.env?.VITE_API_URL || 'http://localhost:4000/api';
const BASE_URL = runtimeApiUrl;
async function request(path, init) {
    const token = ("TURBOPACK compile-time truthy", 1) ? window.localStorage.getItem('auth_token') : "TURBOPACK unreachable";
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token && !path.startsWith('/auth/')) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
        headers,
        ...init
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    const ct = res.headers.get('content-type');
    if (ct && ct.includes('application/json')) return res.json();
    return null;
}
const api = {
    get: (path)=>request(path),
    post: (path, body)=>request(path, {
            method: 'POST',
            body: JSON.stringify(body)
        }),
    put: (path, body)=>request(path, {
            method: 'PUT',
            body: JSON.stringify(body)
        }),
    delete: (path)=>request(path, {
            method: 'DELETE'
        })
};
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/classes.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SCHOOL_CLASSES",
    ()=>SCHOOL_CLASSES
]);
const SCHOOL_CLASSES = [
    "Day Care",
    "Pre-Nursery",
    "Nursery 1",
    "Nursery 2",
    "Class 1",
    "Class 2",
    "Class 3",
    "Class 4",
    "Class 5",
    "Class 6"
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/utils/pdfGenerator.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateAttendanceSheet",
    ()=>generateAttendanceSheet,
    "generateExpenseInvoice",
    ()=>generateExpenseInvoice,
    "generateFinancialSheet",
    ()=>generateFinancialSheet,
    "generateReportCard",
    ()=>generateReportCard,
    "generateTimetable",
    ()=>generateTimetable,
    "generateWorkRecord",
    ()=>generateWorkRecord
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/jspdf/dist/jspdf.es.min.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/api.ts [app-client] (ecmascript)");
;
;
;
const SCHOOL_INFO = {
    name: 'École Primaire et Maternelle',
    address: 'Yaoundé, Cameroon',
    phone: '+237 670 000 000',
    email: 'info@school.cm'
};
function generateExpenseInvoice(expense) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]();
    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(SCHOOL_INFO.name, 105, 15, {
        align: 'center'
    });
    doc.setFontSize(10);
    doc.text(SCHOOL_INFO.address, 105, 22, {
        align: 'center'
    });
    doc.text(`Tel: ${SCHOOL_INFO.phone} | Email: ${SCHOOL_INFO.email}`, 105, 28, {
        align: 'center'
    });
    // Title
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('EXPENSE INVOICE', 105, 50, {
        align: 'center'
    });
    // Invoice details
    doc.setFontSize(10);
    doc.text(`Invoice No: ${expense.invoiceNumber}`, 20, 65);
    doc.text(`Date: ${expense.date}`, 20, 72);
    doc.text(`Payment Method: ${expense.paymentMethod}`, 20, 79);
    // Expense details
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: 90,
        head: [
            [
                'Field',
                'Details'
            ]
        ],
        body: [
            [
                'Category',
                expense.category
            ],
            [
                'Payee',
                expense.payee
            ],
            [
                'Description',
                expense.description
            ],
            [
                'Amount',
                `${expense.amount.toLocaleString()} FCFA`
            ]
        ],
        theme: 'striped',
        headStyles: {
            fillColor: [
                37,
                99,
                235
            ]
        }
    });
    // Footer
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(9);
    doc.text('This is a computer-generated expense record.', 105, finalY, {
        align: 'center'
    });
    doc.save(`Expense_${expense.invoiceNumber}.pdf`);
}
function generateTimetable(timetable, className) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]('l', 'mm', 'a4');
    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 297, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(SCHOOL_INFO.name, 148.5, 15, {
        align: 'center'
    });
    doc.setFontSize(16);
    doc.text(`Class Timetable - ${className}`, 148.5, 28, {
        align: 'center'
    });
    // Group by day
    const days = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday'
    ];
    const tableData = days.map((day)=>{
        const dayEntries = timetable.filter((entry)=>entry.day === day);
        return [
            day,
            ...dayEntries.map((entry)=>`${entry.time}\n${entry.subject}\n(${entry.teacher})`).join('\n\n')
        ];
    });
    doc.setTextColor(0, 0, 0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: 50,
        head: [
            [
                'Day',
                'Schedule'
            ]
        ],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [
                37,
                99,
                235
            ]
        },
        styles: {
            cellPadding: 5,
            fontSize: 10
        }
    });
    doc.save(`Timetable_${className}.pdf`);
}
function generateAttendanceSheet(date, className, students) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]();
    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(SCHOOL_INFO.name, 105, 15, {
        align: 'center'
    });
    doc.setFontSize(14);
    doc.text(`Attendance Sheet - ${className}`, 105, 25, {
        align: 'center'
    });
    doc.setFontSize(10);
    doc.text(`Date: ${date}`, 105, 32, {
        align: 'center'
    });
    // Attendance table
    doc.setTextColor(0, 0, 0);
    const tableData = students.map((student, index)=>[
            (index + 1).toString(),
            student.id,
            `${student.firstName} ${student.lastName}`,
            '',
            '',
            '',
            '' // Remarks
        ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: 50,
        head: [
            [
                'No.',
                'Student ID',
                'Name',
                'Present',
                'Absent',
                'Late',
                'Remarks'
            ]
        ],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [
                37,
                99,
                235
            ]
        },
        styles: {
            fontSize: 9
        },
        columnStyles: {
            3: {
                cellWidth: 15
            },
            4: {
                cellWidth: 15
            },
            5: {
                cellWidth: 15
            }
        }
    });
    doc.save(`Attendance_${className}_${date}.pdf`);
}
// Fallback for legacy public URLs — browser-side fetch
async function loadImageAsDataUrl(url) {
    try {
        const blob = await (await fetch(url)).blob();
        return await new Promise((resolve)=>{
            const reader = new FileReader();
            reader.onloadend = ()=>resolve(reader.result);
            reader.onerror = ()=>resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch  {
        return null;
    }
}
// Routes storage-path logos through the backend (avoids browser CORS on private bucket).
// Falls back to browser fetch for legacy plain URLs.
async function getLogoDataUrl(logo) {
    if (logo.startsWith('schools/')) {
        try {
            const token = ("TURBOPACK compile-time truthy", 1) ? window.localStorage.getItem('auth_token') : "TURBOPACK unreachable";
            const res = await fetch(`${__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BASE_URL"]}/upload/image-data?path=${encodeURIComponent(logo)}`, {
                headers: token ? {
                    Authorization: `Bearer ${token}`
                } : {}
            });
            if (!res.ok) return null;
            const { dataUrl } = await res.json();
            return dataUrl || null;
        } catch  {
            return null;
        }
    }
    return loadImageAsDataUrl(logo);
}
async function generateFinancialSheet(student, ledgerData, schoolInfo) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]();
    // Header background
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 52, 'F');
    // Logo — top-left
    if (schoolInfo?.logo) {
        const dataUrl = await getLogoDataUrl(schoolInfo.logo);
        if (dataUrl) {
            try {
                const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                doc.addImage(dataUrl, fmt, 8, 6, 30, 30);
            } catch  {}
        }
    }
    doc.setTextColor(255, 255, 255);
    // School name — centered
    doc.setFontSize(18);
    doc.text(schoolInfo?.name ?? SCHOOL_INFO.name, 105, 15, {
        align: 'center'
    });
    // Motto — centered, italic, only if non-empty
    const motto = schoolInfo?.motto?.trim();
    if (motto) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(motto, 105, 23, {
            align: 'center'
        });
        doc.setFont('helvetica', 'normal');
    }
    // Academic year — right-aligned
    if (schoolInfo?.academicYear) {
        doc.setFontSize(9);
        doc.text(`Academic Year: ${schoolInfo.academicYear}`, 195, 33, {
            align: 'right'
        });
    }
    // Document title — centered
    doc.setFontSize(13);
    doc.text('Individual Financial Sheet', 105, 44, {
        align: 'center'
    });
    // Student info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Student Information', 20, 62);
    doc.setFontSize(10);
    doc.text(`Name: ${student.firstName} ${student.lastName}`, 20, 70);
    doc.text(`Student ID: ${student.id}`, 20, 77);
    doc.text(`Class: ${student.class}`, 20, 84);
    const { entries, totalCharged, totalPaid, balance } = ledgerData;
    if (entries.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(150, 150, 150);
        doc.text('No financial records found for this student.', 105, 107, {
            align: 'center'
        });
    } else {
        const tableData = entries.map((entry)=>[
                new Date(entry.entryDate).toLocaleDateString('en-GB'),
                entry.type === 'CHARGE' ? 'Charge' : 'Payment',
                entry.category?.name ?? '—',
                entry.description,
                `${entry.amount.toLocaleString()} FCFA`
            ]);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
            startY: 95,
            head: [
                [
                    'Date',
                    'Type',
                    'Category',
                    'Description',
                    'Amount (FCFA)'
                ]
            ],
            body: tableData,
            theme: 'striped',
            headStyles: {
                fillColor: [
                    37,
                    99,
                    235
                ]
            },
            styles: {
                fontSize: 9
            },
            columnStyles: {
                0: {
                    cellWidth: 28
                },
                1: {
                    cellWidth: 22
                },
                2: {
                    cellWidth: 32
                },
                4: {
                    cellWidth: 30,
                    halign: 'right'
                }
            }
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
            startY: doc.lastAutoTable.finalY + 8,
            body: [
                [
                    'Total Charged',
                    `${totalCharged.toLocaleString()} FCFA`
                ],
                [
                    'Total Paid',
                    `${totalPaid.toLocaleString()} FCFA`
                ],
                [
                    'Balance Owed',
                    `${balance.toLocaleString()} FCFA`
                ]
            ],
            theme: 'plain',
            styles: {
                fontSize: 10
            },
            columnStyles: {
                0: {
                    cellWidth: 60,
                    fontStyle: 'bold'
                },
                1: {
                    cellWidth: 60,
                    halign: 'right'
                }
            },
            margin: {
                left: 110
            }
        });
    }
    const url = doc.output('bloburl');
    window.open(url, '_blank');
}
function generateWorkRecord(record) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]();
    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(SCHOOL_INFO.name, 105, 15, {
        align: 'center'
    });
    doc.setFontSize(14);
    doc.text('Record of Work', 105, 28, {
        align: 'center'
    });
    // Record details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    const details = [
        [
            'Teacher',
            record.staffName
        ],
        [
            'Date',
            record.date
        ],
        [
            'Class',
            record.class
        ],
        [
            'Subject',
            record.subject
        ],
        [
            'Topic',
            record.topic
        ]
    ];
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: 50,
        body: details,
        theme: 'plain',
        styles: {
            fontSize: 10
        },
        columnStyles: {
            0: {
                cellWidth: 40,
                fontStyle: 'bold'
            },
            1: {
                cellWidth: 150
            }
        }
    });
    let yPos = doc.lastAutoTable.finalY + 15;
    // Objectives
    doc.setFontSize(12);
    doc.text('Learning Objectives:', 20, yPos);
    doc.setFontSize(10);
    const objectivesLines = doc.splitTextToSize(record.objectives, 170);
    doc.text(objectivesLines, 20, yPos + 7);
    yPos += 7 + objectivesLines.length * 5 + 10;
    // Activities
    doc.setFontSize(12);
    doc.text('Activities:', 20, yPos);
    doc.setFontSize(10);
    const activitiesLines = doc.splitTextToSize(record.activities, 170);
    doc.text(activitiesLines, 20, yPos + 7);
    yPos += 7 + activitiesLines.length * 5 + 10;
    // Evaluation
    doc.setFontSize(12);
    doc.text('Evaluation:', 20, yPos);
    doc.setFontSize(10);
    const evaluationLines = doc.splitTextToSize(record.evaluation, 170);
    doc.text(evaluationLines, 20, yPos + 7);
    yPos += 7 + evaluationLines.length * 5 + 10;
    // Remarks
    doc.setFontSize(12);
    doc.text('Remarks:', 20, yPos);
    doc.setFontSize(10);
    const remarksLines = doc.splitTextToSize(record.remarks, 170);
    doc.text(remarksLines, 20, yPos + 7);
    doc.save(`Work_Record_${record.staffName}_${record.date}.pdf`);
}
function generateReportCard(report) {
    const doc = new __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2f$dist$2f$jspdf$2e$es$2e$min$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsPDF"]();
    // Header with school colors
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(SCHOOL_INFO.name, 105, 20, {
        align: 'center'
    });
    doc.setFontSize(16);
    doc.text('STUDENT REPORT CARD', 105, 32, {
        align: 'center'
    });
    doc.setFontSize(10);
    doc.text(`${report.term} - ${report.academicYear}`, 105, 42, {
        align: 'center'
    });
    // Student information
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Student Information', 20, 65);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: 70,
        body: [
            [
                'Name:',
                report.studentName,
                'Class:',
                report.class
            ],
            [
                'Average Score:',
                `${report.averageScore}%`,
                'Position:',
                `${report.position} of ${report.totalStudents}`
            ],
            [
                'Attendance:',
                `${report.attendance}%`,
                '',
                ''
            ]
        ],
        theme: 'plain',
        styles: {
            fontSize: 10
        },
        columnStyles: {
            0: {
                cellWidth: 35,
                fontStyle: 'bold'
            },
            1: {
                cellWidth: 60
            },
            2: {
                cellWidth: 35,
                fontStyle: 'bold'
            },
            3: {
                cellWidth: 60
            }
        }
    });
    // Subjects table
    const subjectData = report.subjects.map((subject)=>[
            subject.name,
            subject.score.toString(),
            subject.grade,
            subject.teacherComment
        ]);
    doc.setFontSize(12);
    doc.text('Academic Performance', 20, doc.lastAutoTable.finalY + 15);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$jspdf$2d$autotable$2f$dist$2f$jspdf$2e$plugin$2e$autotable$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [
            [
                'Subject',
                'Score',
                'Grade',
                'Teacher Comment'
            ]
        ],
        body: subjectData,
        theme: 'striped',
        headStyles: {
            fillColor: [
                37,
                99,
                235
            ]
        },
        styles: {
            fontSize: 10
        },
        columnStyles: {
            0: {
                cellWidth: 40
            },
            1: {
                cellWidth: 20
            },
            2: {
                cellWidth: 20
            },
            3: {
                cellWidth: 100
            }
        }
    });
    // Grading scale
    doc.setFontSize(10);
    doc.text('Grading Scale: A (80-100) | B (70-79) | C (60-69) | D (50-59) | F (0-49)', 20, doc.lastAutoTable.finalY + 10);
    // Head teacher comment
    doc.setFontSize(12);
    doc.text('Head Teacher Comment:', 20, doc.lastAutoTable.finalY + 22);
    doc.setFontSize(10);
    const commentLines = doc.splitTextToSize(report.headTeacherComment, 170);
    doc.text(commentLines, 20, doc.lastAutoTable.finalY + 29);
    // Signature section
    const finalY = doc.lastAutoTable.finalY + 29 + commentLines.length * 5 + 15;
    doc.line(20, finalY, 80, finalY);
    doc.text('Head Teacher Signature', 25, finalY + 5);
    doc.line(130, finalY, 190, finalY);
    doc.text('Date', 155, finalY + 5);
    doc.save(`Report_Card_${report.studentName}_${report.term}.pdf`);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/data/mockData.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "mockAttendance",
    ()=>mockAttendance,
    "mockExpenses",
    ()=>mockExpenses,
    "mockReportCards",
    ()=>mockReportCards,
    "mockStaff",
    ()=>mockStaff,
    "mockStudents",
    ()=>mockStudents,
    "mockTimetable",
    ()=>mockTimetable,
    "mockWorkRecords",
    ()=>mockWorkRecords,
    "schoolSettings",
    ()=>schoolSettings
]);
const mockStudents = [
    {
        id: 'STU001',
        firstName: 'Amina',
        lastName: 'Ngono',
        dateOfBirth: '2016-03-15',
        gender: 'female',
        class: 'Primary 3',
        parentName: 'Marie Ngono',
        parentPhone: '+237 670 123 456',
        address: 'Yaoundé, Bastos',
        enrollmentDate: '2019-09-01'
    },
    {
        id: 'STU002',
        firstName: 'Kouam',
        lastName: 'Tchinda',
        dateOfBirth: '2017-07-22',
        gender: 'male',
        class: 'Primary 2',
        parentName: 'Jean Tchinda',
        parentPhone: '+237 677 234 567',
        address: 'Douala, Bonanjo',
        enrollmentDate: '2020-09-01'
    },
    {
        id: 'STU003',
        firstName: 'Fatima',
        lastName: 'Bello',
        dateOfBirth: '2015-11-08',
        gender: 'female',
        class: 'Primary 4',
        parentName: 'Hassan Bello',
        parentPhone: '+237 680 345 678',
        address: 'Yaoundé, Melen',
        enrollmentDate: '2018-09-01'
    },
    {
        id: 'STU004',
        firstName: 'Emmanuel',
        lastName: 'Mba',
        dateOfBirth: '2018-01-20',
        gender: 'male',
        class: 'Primary 1',
        parentName: 'Grace Mba',
        parentPhone: '+237 690 456 789',
        address: 'Douala, Akwa',
        enrollmentDate: '2021-09-01'
    }
];
const mockStaff = [
    {
        id: 'STF001',
        firstName: 'Pauline',
        lastName: 'Fotso',
        role: 'Head Teacher',
        phone: '+237 670 111 222',
        email: 'p.fotso@school.cm',
        hireDate: '2015-01-15',
        salary: 250000
    },
    {
        id: 'STF002',
        firstName: 'Martin',
        lastName: 'Ekani',
        role: 'Mathematics Teacher',
        phone: '+237 677 222 333',
        email: 'm.ekani@school.cm',
        hireDate: '2017-09-01',
        salary: 150000
    },
    {
        id: 'STF003',
        firstName: 'Grace',
        lastName: 'Ayuk',
        role: 'English Teacher',
        phone: '+237 680 333 444',
        email: 'g.ayuk@school.cm',
        hireDate: '2018-01-10',
        salary: 150000
    },
    {
        id: 'STF004',
        firstName: 'Samuel',
        lastName: 'Nkeng',
        role: 'Science Teacher',
        phone: '+237 690 444 555',
        email: 's.nkeng@school.cm',
        hireDate: '2019-09-01',
        salary: 140000
    }
];
const mockExpenses = [
    {
        id: 'EXP001',
        date: '2024-10-15',
        category: 'Utilities',
        description: 'Electricity bill for October',
        amount: 45000,
        payee: 'ENEO Cameroon',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: 'INV-2024-10-001'
    },
    {
        id: 'EXP002',
        date: '2024-10-20',
        category: 'Supplies',
        description: 'Office stationery and teaching materials',
        amount: 35000,
        payee: 'Papeterie Moderne',
        paymentMethod: 'Cash',
        invoiceNumber: 'INV-2024-10-002'
    },
    {
        id: 'EXP003',
        date: '2024-10-25',
        category: 'Maintenance',
        description: 'Classroom furniture repairs',
        amount: 55000,
        payee: 'Menuiserie Excellence',
        paymentMethod: 'Mobile Money',
        invoiceNumber: 'INV-2024-10-003'
    }
];
const mockReportCards = [
    {
        id: 'RC001',
        studentId: 'STU001',
        studentName: 'Amina Ngono',
        class: 'Primary 3',
        term: 'Term 1',
        academicYear: '2024/2025',
        subjects: [
            {
                name: 'Mathematics',
                score: 85,
                grade: 'A',
                teacherComment: 'Excellent work'
            },
            {
                name: 'English',
                score: 78,
                grade: 'B',
                teacherComment: 'Good progress'
            },
            {
                name: 'French',
                score: 82,
                grade: 'A',
                teacherComment: 'Very good'
            },
            {
                name: 'Science',
                score: 90,
                grade: 'A',
                teacherComment: 'Outstanding'
            },
            {
                name: 'Social Studies',
                score: 75,
                grade: 'B',
                teacherComment: 'Satisfactory'
            }
        ],
        averageScore: 82,
        position: 2,
        totalStudents: 35,
        attendance: 95,
        headTeacherComment: 'Amina is a dedicated student with excellent performance. Keep it up!'
    }
];
const mockAttendance = [
    {
        id: 'ATT001',
        date: '2024-10-31',
        type: 'student',
        personId: 'STU001',
        personName: 'Amina Ngono',
        status: 'present'
    },
    {
        id: 'ATT002',
        date: '2024-10-31',
        type: 'student',
        personId: 'STU002',
        personName: 'Kouam Tchinda',
        status: 'absent',
        remarks: 'Sick'
    },
    {
        id: 'ATT003',
        date: '2024-10-31',
        type: 'staff',
        personId: 'STF001',
        personName: 'Pauline Fotso',
        status: 'present'
    }
];
const mockWorkRecords = [
    {
        id: 'WR001',
        staffId: 'STF002',
        staffName: 'Martin Ekani',
        date: '2024-10-31',
        subject: 'Mathematics',
        class: 'Primary 3',
        topic: 'Fractions and Decimals',
        objectives: 'Students will be able to convert fractions to decimals and vice versa',
        activities: '1. Introduction to fractions\n2. Converting fractions to decimals\n3. Practice exercises\n4. Group work',
        evaluation: 'Written test on fraction to decimal conversion',
        remarks: 'Students showed good understanding. Need more practice on complex fractions.'
    }
];
const mockTimetable = [
    {
        id: 'TT001',
        day: 'Monday',
        time: '08:00 - 09:00',
        class: 'Primary 3',
        subject: 'Mathematics',
        teacher: 'Martin Ekani'
    },
    {
        id: 'TT002',
        day: 'Monday',
        time: '09:00 - 10:00',
        class: 'Primary 3',
        subject: 'English',
        teacher: 'Grace Ayuk'
    },
    {
        id: 'TT003',
        day: 'Monday',
        time: '10:30 - 11:30',
        class: 'Primary 3',
        subject: 'Science',
        teacher: 'Samuel Nkeng'
    },
    {
        id: 'TT004',
        day: 'Tuesday',
        time: '08:00 - 09:00',
        class: 'Primary 3',
        subject: 'French',
        teacher: 'Pauline Fotso'
    },
    {
        id: 'TT005',
        day: 'Tuesday',
        time: '09:00 - 10:00',
        class: 'Primary 3',
        subject: 'Mathematics',
        teacher: 'Martin Ekani'
    }
];
let schoolSettings = {
    name: 'Excellence Nursery & Primary School',
    logo: 'https://img.freepik.com/premium-vector/school-building-illustration_638438-385.jpg',
    academicYear: '2025/2026',
    currentTerm: 'Term 1',
    subjectsPerClass: [
        {
            id: 'SC001',
            className: 'Day Care',
            subjects: [
                'English',
                'Mathematics',
                'Creative Arts',
                'Physical Education'
            ]
        },
        {
            id: 'SC002',
            className: 'Pre-Nursery',
            subjects: [
                'English',
                'Mathematics',
                'Creative Arts',
                'Physical Education',
                'Environmental Studies'
            ]
        },
        {
            id: 'SC003',
            className: 'Nursery 1',
            subjects: [
                'English',
                'Mathematics',
                'Creative Arts',
                'Physical Education',
                'Environmental Studies'
            ]
        },
        {
            id: 'SC004',
            className: 'Nursery 2',
            subjects: [
                'English',
                'Mathematics',
                'Creative Arts',
                'Physical Education',
                'Environmental Studies'
            ]
        },
        {
            id: 'SC005',
            className: 'Class 1',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts'
            ]
        },
        {
            id: 'SC006',
            className: 'Class 2',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts',
                'ICT'
            ]
        },
        {
            id: 'SC007',
            className: 'Class 3',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts',
                'ICT'
            ]
        },
        {
            id: 'SC008',
            className: 'Class 4',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts',
                'ICT',
                'Religious Education'
            ]
        },
        {
            id: 'SC009',
            className: 'Class 5',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts',
                'ICT',
                'Religious Education'
            ]
        },
        {
            id: 'SC010',
            className: 'Class 6',
            subjects: [
                'English',
                'Mathematics',
                'Science',
                'Social Studies',
                'French',
                'Physical Education',
                'Creative Arts',
                'ICT',
                'Religious Education'
            ]
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>App
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$lib$2f$SisCache$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/lib/SisCache.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/Sidebar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/Dashboard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StudentsManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/StudentsManagement.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StudentProfile$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/StudentProfile.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StaffManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/StaffManagement.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$FinanceOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/FinanceOverview.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ExpensesManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/ExpensesManagement.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ReportCards$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/ReportCards.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Attendance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/Attendance.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Timetable$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/Timetable.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$SchoolSettings$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/SchoolSettings.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ClassesManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/ClassesManagement.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$SubjectsManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/OneDrive/Desktop/Sis/Code/SIS/src/components/SubjectsManagement.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
function App() {
    _s();
    const [currentPage, setCurrentPage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('dashboard');
    const [selectedStudent, setSelectedStudent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const renderPage = ()=>{
        switch(currentPage){
            case 'dashboard':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dashboard"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 39,
                    columnNumber: 16
                }, this);
            case 'students':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StudentsManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StudentsManagement"], {
                    onNavigate: setCurrentPage,
                    onViewStudent: (s)=>{
                        setSelectedStudent(s);
                        setCurrentPage('student-profile');
                    }
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 42,
                    columnNumber: 11
                }, this);
            case 'student-profile':
                return selectedStudent ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StudentProfile$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StudentProfile"], {
                    student: selectedStudent,
                    onNavigate: setCurrentPage
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 49,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StudentsManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StudentsManagement"], {
                    onNavigate: setCurrentPage,
                    onViewStudent: (s)=>{
                        setSelectedStudent(s);
                        setCurrentPage('student-profile');
                    }
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 51,
                    columnNumber: 11
                }, this);
            case 'staff':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$StaffManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StaffManagement"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 57,
                    columnNumber: 16
                }, this);
            case 'finance':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$FinanceOverview$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FinanceOverview"], {
                    onNavigate: setCurrentPage,
                    onViewStudent: (s)=>{
                        setSelectedStudent(s);
                        setCurrentPage('student-profile');
                    }
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 60,
                    columnNumber: 11
                }, this);
            case 'expenses':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ExpensesManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ExpensesManagement"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 66,
                    columnNumber: 16
                }, this);
            case 'report-cards':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ReportCards$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ReportCards"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 68,
                    columnNumber: 16
                }, this);
            case 'attendance':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Attendance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Attendance"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 70,
                    columnNumber: 16
                }, this);
            case 'timetable':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Timetable$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Timetable"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 72,
                    columnNumber: 16
                }, this);
            case 'classes':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$ClassesManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ClassesManagement"], {
                    onNavigate: setCurrentPage
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 74,
                    columnNumber: 16
                }, this);
            case 'subjects':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$SubjectsManagement$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SubjectsManagement"], {
                    onNavigate: setCurrentPage
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 76,
                    columnNumber: 16
                }, this);
            case 'settings':
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$SchoolSettings$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SchoolSettings"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 78,
                    columnNumber: 16
                }, this);
            default:
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dashboard"], {}, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 80,
                    columnNumber: 16
                }, this);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$lib$2f$SisCache$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SisCacheProvider"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-screen overflow-hidden bg-gray-50",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$src$2f$components$2f$Sidebar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sidebar"], {
                    currentPage: currentPage,
                    onNavigate: setCurrentPage
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 87,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$OneDrive$2f$Desktop$2f$Sis$2f$Code$2f$SIS$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                    className: "flex-1 overflow-y-auto",
                    children: renderPage()
                }, void 0, false, {
                    fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
                    lineNumber: 88,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
            lineNumber: 86,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/OneDrive/Desktop/Sis/Code/SIS/src/App.tsx",
        lineNumber: 85,
        columnNumber: 5
    }, this);
}
_s(App, "TxBPHJXarH5IXSq30aJNCRgM7tQ=");
_c = App;
var _c;
__turbopack_context__.k.register(_c, "App");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=OneDrive_Desktop_Sis_Code_SIS_src_6d1d3e40._.js.map