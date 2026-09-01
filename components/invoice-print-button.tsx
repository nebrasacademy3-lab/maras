"use client";

import { Printer } from "lucide-react";

export function InvoicePrintButton(){return <button type="button" className="invoice-print-button" onClick={()=>window.print()}><Printer size={17}/> طباعة أو حفظ PDF</button>;}
