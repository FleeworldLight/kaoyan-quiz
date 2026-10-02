import React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as RTabs from "@radix-ui/react-tabs";
import * as RTooltip from "@radix-ui/react-tooltip";
import * as RProgress from "@radix-ui/react-progress";
import * as RSwitch from "@radix-ui/react-switch";
import * as RDialog from "@radix-ui/react-dialog";
import { X, Inbox, Loader2 } from "lucide-react";
import { cn } from "../lib/utils.js";

/* ----------------------------- Button ----------------------------- */
const BTN_VARIANT = {
  primary: "bg-brand text-white border-brand hover:bg-brand-hover active:bg-brand-hover",
  secondary: "bg-surface text-ink border-line hover:bg-subtle hover:border-line-strong",
  soft: "bg-brand-soft text-brand border-brand-line hover:bg-[#e2ebff]",
  ghost: "bg-transparent text-ink-muted border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border-bad-line hover:bg-bad-soft",
  dangerSolid: "bg-bad text-white border-bad hover:bg-[#ad3129]",
  navy: "bg-navy text-white border-navy hover:bg-[#1f438f]",
};
const BTN_SIZE = {
  xs: "h-6 px-2 text-[11.5px] gap-1 rounded-[5px]",
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5 rounded-sm",
  md: "h-8.5 px-3.5 text-[13px] gap-1.5 rounded-md",
  lg: "h-10 px-5 text-sm gap-2 rounded-md",
  icon: "h-8 w-8 justify-center rounded-md",
  iconSm: "h-7 w-7 justify-center rounded-sm",
};

export const Button = React.forwardRef(function Button(
  { className, variant = "secondary", size = "md", asChild, loading, children, ...props },
  ref
) {
  const cls = cn(
    "inline-flex select-none items-center justify-center border font-semibold whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow] duration-100",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-45",
    BTN_VARIANT[variant],
    BTN_SIZE[size],
    className
  );
  // asChild 时把样式交给唯一子元素（Radix Slot 只接受单个 React 元素）
  if (asChild) {
    return <Slot ref={ref} className={cls} {...props}>{children}</Slot>;
  }
  return (
    <button ref={ref} className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
});

export const IconButton = React.forwardRef(function IconButton({ className, variant = "ghost", size = "icon", ...rest }, ref) {
  return <Button ref={ref} variant={variant} size={size} className={className} {...rest} />;
});

/* ------------------------------ Card ------------------------------ */
export function Card({ className, as: As = "section", ...rest }) {
  return <As className={cn("rounded-lg border border-line bg-surface shadow-panel", className)} {...rest} />;
}
export function CardHead({ className, title, desc, extra, icon: Icon, ...rest }) {
  return (
    <header className={cn("flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3", className)} {...rest}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-strong">
          {Icon ? <Icon className="size-4 text-brand" /> : null}
          {title}
        </h3>
        {desc ? <p className="mt-0.5 text-[12.5px] text-ink-subtle">{desc}</p> : null}
      </div>
      {extra ? <div className="shrink-0">{extra}</div> : null}
    </header>
  );
}
export function CardBody({ className, ...rest }) {
  return <div className={cn("px-4 py-3.5", className)} {...rest} />;
}

/* ------------------------------ Badge ----------------------------- */
const TONE = {
  neutral: "bg-sunken text-ink-muted border-transparent",
  brand: "bg-brand-soft text-brand border-brand-line",
  ok: "bg-ok-soft text-ok border-ok-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  bad: "bg-bad-soft text-bad border-bad-line",
  navy: "bg-navy-soft text-navy border-[#c9d8f2]",
  outline: "bg-surface text-ink-subtle border-line",
};
export function Badge({ className, tone = "neutral", dot, children, ...rest }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[1px] text-[11.5px] leading-[18px] font-medium",
        TONE[tone] || TONE.neutral,
        className
      )}
      {...rest}
    >
      {dot ? <i className={cn("size-1.5 rounded-full", tone === "ok" ? "bg-ok" : tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-brand")} /> : null}
      {children}
    </span>
  );
}

/* ---------------------------- Segmented --------------------------- */
export function Segmented({ value, onChange, options, className, size = "md" }) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-sunken p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[5px] font-semibold transition-colors",
              size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-[12.5px]",
              active ? "bg-surface text-brand shadow-control" : "text-ink-subtle hover:text-ink"
            )}
          >
            {o.label}
            {o.count != null ? <span className={cn("ml-1 tabular-nums", active ? "text-brand/70" : "text-ink-faint")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- Progress ---------------------------- */
export function Progress({ value = 0, className, tone = "brand", height = 6, showLabel = false }) {
  const p = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-brand";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <RProgress.Root className="relative grow overflow-hidden rounded-full bg-sunken" style={{ height }}>
        <RProgress.Indicator className={cn("h-full rounded-full transition-transform duration-300", color)} style={{ width: p + "%" }} />
      </RProgress.Root>
      {showLabel ? <span className="w-9 shrink-0 text-right text-[11.5px] tabular-nums text-ink-subtle">{p}%</span> : null}
    </div>
  );
}

/* ------------------------------ Tabs ------------------------------ */
export function Tabs({ value, onValueChange, items, className, size = "md" }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="flex items-center gap-0.5 border-b border-line">
        {items.map((it) => (
          <RTabs.Trigger
            key={it.value}
            value={it.value}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent font-semibold whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1.5 text-[12.5px]" : "px-3 py-2 text-[13px]",
              "text-ink-subtle transition-colors hover:text-ink",
              "data-[state=active]:border-brand data-[state=active]:text-brand"
            )}
          >
            {it.icon ? <it.icon className="size-3.5" /> : null}
            {it.label}
            {it.count != null ? <span className="rounded bg-sunken px-1 text-[11px] tabular-nums text-ink-faint">{it.count}</span> : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  );
}

/* ----------------------------- Tooltip ---------------------------- */
export function TipProvider({ children }) {
  return <RTooltip.Provider delayDuration={220}>{children}</RTooltip.Provider>;
}
export function Tip({ label, children, side = "top" }) {
  if (!label) return children;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-ink shadow-pop"
        >
          {label}
          <RTooltip.Arrow className="fill-[var(--color-surface)]" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/* ------------------------------ Switch ---------------------------- */
export function Switch({ checked, onCheckedChange, label, desc, className }) {
  const id = React.useId();
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {label ? (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-[13px] font-medium text-ink">{label}</span>
          {desc ? <span className="block text-[12px] text-ink-subtle">{desc}</span> : null}
        </label>
      ) : null}
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-[18px] w-8 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RSwitch.Thumb className="block size-3.5 translate-x-[2px] rounded-full bg-white shadow-control transition-transform duration-150 data-[state=checked]:translate-x-[16px]" />
      </RSwitch.Root>
    </div>
  );
}

/* ------------------------------ Dialog ---------------------------- */
export function Modal({ open, onOpenChange, title, desc, children, footer, width = "max-w-lg" }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#0c1421]/45 backdrop-blur-[1px] data-[state=open]:animate-in" />
        <RDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface shadow-pop",
            width
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
            <div>
              <RDialog.Title className="text-[14.5px] font-semibold text-ink-strong">{title}</RDialog.Title>
              {desc ? <RDialog.Description className="mt-0.5 text-[12.5px] text-ink-subtle">{desc}</RDialog.Description> : null}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="关闭"><X className="size-4" /></Button>
            </RDialog.Close>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line-subtle px-4 py-3">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ------------------------------ 杂项 ------------------------------ */
export function StatCard({ label, value, unit, hint, tone = "ink", icon: Icon, className }) {
  const valueTone = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "brand" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink-strong";
  return (
    <div className={cn("rounded-lg border border-line bg-surface px-3.5 py-3 shadow-panel", className)}>
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-subtle">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </div>
      <div className={cn("mt-1 flex items-baseline gap-1 font-semibold", valueTone)}>
        <span className="text-[22px] leading-none tabular-nums">{value}</span>
        {unit ? <span className="text-[12.5px] font-medium text-ink-subtle">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-[11.5px] text-ink-faint">{hint}</div> : null}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, desc, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-sunken text-ink-faint">
        <Icon className="size-5" />
      </span>
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      {desc ? <p className="max-w-md text-[12.5px] text-ink-subtle">{desc}</p> : null}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = "加载中…", className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-16 text-ink-subtle", className)}>
      <Loader2 className="size-5 animate-spin text-brand" />
      <span className="text-[12.5px]">{label}</span>
    </div>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="rounded-[4px] border border-line bg-subtle px-1.5 py-[1px] font-mono text-[11px] text-ink-subtle shadow-control">
      {children}
    </kbd>
  );
}

export function Divider({ className }) {
  return <div className={cn("h-px bg-line-subtle", className)} />;
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "h-8.5 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";
