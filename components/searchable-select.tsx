"use client";

import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import styles from "./searchable-select.module.css";

type Choice = { value: string; label: string; group?: string; disabled: boolean };
type Props = SelectHTMLAttributes<HTMLSelectElement> & { searchPlaceholder?: string };

function optionText(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : "";
  }).join("");
}

function readChoices(children: ReactNode, group?: string, disabled = false): Choice[] {
  return Children.toArray(children).flatMap((child): Choice[] => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === "option") {
      const label = child.props.label || optionText(child.props.children);
      return [{ value: String(child.props.value ?? label), label, group, disabled: disabled || Boolean(child.props.disabled) }];
    }
    return readChoices(child.props.children, child.type === "optgroup" ? child.props.label : group, disabled || Boolean(child.props.disabled));
  });
}

function normalize(text: string) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").toLocaleLowerCase().trim();
}

function valuesOf(value: Props["value"]): string[] {
  return value == null ? [] : (Array.isArray(value) ? value : [value]).map(String);
}

/** Keeps a real select for native form validation, reset and change events. */
export function SearchableSelect({ children, value, defaultValue, onChange, onInvalid, className, style, id, disabled, multiple, autoFocus, searchPlaceholder = "ابحث في الخيارات...", ...props }: Props) {
  const uid = useId();
  const listId = `${uid}-options`;
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(() => valuesOf(defaultValue));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [placement, setPlacement] = useState<{ style: CSSProperties; direction: "rtl" | "ltr" }>({ style: {}, direction: "rtl" });
  const options = useMemo(() => readChoices(children).map((option, index) => ({ ...option, index, search: normalize(`${option.label} ${option.value} ${option.group || ""}`) })), [children]);
  const requested = value === undefined ? localValue : valuesOf(value);
  const selected = requested.filter((entry) => options.some((option) => option.value === entry));
  if (!multiple && selected.length === 0) {
    const first = options.find((option) => !option.disabled);
    if (first) selected.push(first.value);
  }
  const filtered = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return options.filter((option) => tokens.every((token) => option.search.includes(token)));
  }, [options, query]);
  const enabled = filtered.filter((option) => !option.disabled);
  const activeChoice = enabled[Math.min(active, Math.max(0, enabled.length - 1))];
  const summary = options.filter((option) => selected.includes(option.value)).map((option) => option.label).join("، ") || "اختر من القائمة";

  function updatePlacement() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    const direction = getComputedStyle(trigger).direction === "ltr" ? "ltr" : "rtl";
    const width = Math.min(Math.max(rect.width, 270), viewportWidth - 24);
    const below = viewportTop + viewportHeight - rect.bottom - 16;
    const above = rect.top - viewportTop - 16;
    const placeAbove = below < 240 && above > below;
    const maxHeight = Math.max(140, Math.min(390, placeAbove ? above : below));
    const left = Math.max(12, Math.min(direction === "rtl" ? rect.right - width : rect.left, viewportWidth - width - 12));
    setPlacement({ direction, style: { width, left, maxHeight, top: placeAbove ? Math.max(viewportTop + 12, rect.top - maxHeight - 6) : rect.bottom + 6 } });
  }

  function show() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.filter((option) => !option.disabled).findIndex((option) => selected.includes(option.value))));
    updatePlacement();
    setOpen(true);
  }

  function close(returnFocus = false) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(option: Choice) {
    const native = nativeRef.current;
    if (!native || option.disabled || disabled) return;
    if (multiple) {
      const selectedOption = Array.from(native.options).find((entry) => entry.value === option.value);
      if (selectedOption) selectedOption.selected = !selectedOption.selected;
    } else {
      native.value = option.value;
    }
    native.dispatchEvent(new Event("change", { bubbles: true }));
    if (!multiple) close(true);
    else searchRef.current?.focus();
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => enabled.length ? (current + step + enabled.length) % enabled.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeChoice) choose(activeChoice);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(true);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(Math.max(0, enabled.length - 1));
    }
  }

  useEffect(() => {
    const native = nativeRef.current;
    const form = native?.form;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function reset() {
      timer = setTimeout(() => {
        if (native) setLocalValue(Array.from(native.selectedOptions).map((option) => option.value));
        setInvalid(false);
        setOpen(false);
      }, 0);
    }
    form?.addEventListener("reset", reset);
    return () => { form?.removeEventListener("reset", reset); if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    window.visualViewport?.addEventListener("resize", updatePlacement);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      window.visualViewport?.removeEventListener("resize", updatePlacement);
    };
  }, [open]);

  useEffect(() => {
    if (open && activeChoice) panelRef.current?.querySelector(`[data-choice-index="${activeChoice.index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeChoice, options]);

  return <span className={`${styles.root} ${className || ""}`} style={style} data-search-select="" dir={props.dir}>
    <button ref={triggerRef} id={id} type="button" role="combobox" className={styles.trigger} disabled={disabled} autoFocus={autoFocus}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-invalid={invalid || props["aria-invalid"]}
      aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={[props["aria-describedby"], invalid ? `${uid}-error` : null].filter(Boolean).join(" ") || undefined} title={props.title || summary}
      onClick={() => open ? close() : show()} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span>{summary}</span><span className={styles.affordance} aria-hidden="true"><Search size={14} /><ChevronDown size={15} /></span>
    </button>
    <select {...props} ref={nativeRef} value={value} defaultValue={defaultValue} disabled={disabled} multiple={multiple} tabIndex={-1} aria-hidden="true" className={styles.native}
      onChange={(event) => { setLocalValue(Array.from(event.currentTarget.selectedOptions).map((option) => option.value)); setInvalid(false); onChange?.(event); }}
      onInvalid={(event) => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus(); onInvalid?.(event); }}>
      {children}
    </select>
    {invalid ? <span id={`${uid}-error`} className={styles.error} role="alert">اختر قيمة من القائمة للمتابعة.</span> : null}
    {open && createPortal(<div ref={panelRef} className={styles.panel} style={placement.style} dir={placement.direction}>
      <div className={styles.search}><Search size={17} aria-hidden="true" /><input ref={searchRef} type="text" role="combobox" autoComplete="off" spellCheck={false}
        value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={handleKeys}
        aria-label={searchPlaceholder} aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={activeChoice ? `${uid}-${activeChoice.index}` : undefined} placeholder={searchPlaceholder} />
        <button type="button" aria-label="إغلاق الخيارات" onClick={() => close(true)}><X size={16} /></button>
      </div>
      <div className={styles.results} id={listId} role="listbox" aria-label={props["aria-label"] || "الخيارات"} aria-multiselectable={multiple || undefined}>
        {filtered.map((option, index) => <div key={`${option.value}-${index}`}>
          {option.group && option.group !== filtered[index - 1]?.group ? <div className={styles.group}>{option.group}</div> : null}
          <div id={`${uid}-${option.index}`} data-choice-index={option.index} role="option" aria-selected={selected.includes(option.value)} aria-disabled={option.disabled || undefined}
            className={`${styles.option} ${option === activeChoice ? styles.active : ""}`} onPointerMove={() => { if (!option.disabled) setActive(enabled.indexOf(option)); }}
            onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
            <span>{option.label}</span>{selected.includes(option.value) ? <Check size={16} aria-hidden="true" /> : null}
          </div>
        </div>)}
        {!filtered.length ? <p className={styles.empty}>لا توجد نتائج مطابقة. جرّب اسمًا آخر.</p> : null}
      </div>
      <div className={styles.footer} role="status">{filtered.length.toLocaleString("ar-SA")} خيار{multiple ? " · يمكنك اختيار أكثر من عنصر" : " · اكتب للوصول بسرعة"}</div>
    </div>, document.body)}
  </span>;
}
