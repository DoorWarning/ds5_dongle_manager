import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Shared building blocks for the PC and NS settings pages. */

export function Section({ icon, title, description, wide = false, children }: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Span both grid columns. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`config-section ${wide ? "ns-wide" : ""}`}>
      <div className="config-section-heading">
        <span className="config-section-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="control-stack compact-stack">{children}</div>
    </section>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="ns-stat">
      <span>{label}</span>
      <strong>
        {value}
        {unit && <em>{unit}</em>}
      </strong>
    </div>
  );
}

export function StatusChip({ icon, on, children }: { icon: ReactNode; on: boolean; children: ReactNode }) {
  return (
    <span className={`ns-chip ${on ? "is-on" : ""}`}>
      {icon}
      {children}
    </span>
  );
}

export function PageTabs<Key extends string>({ tabs, value, label, onChange }: {
  tabs: ReadonlyArray<{ key: Key; icon: React.ComponentType<{ size?: number }> }>;
  value: Key;
  label: (key: Key) => string;
  onChange: (key: Key) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Key)} className="ns-tabs">
      <TabsList className="grid h-11 w-full" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ key, icon: Icon }) => (
          <TabsTrigger key={key} value={key} className="h-9 gap-1.5 text-sm font-bold">
            <Icon size={15} />
            {label(key)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
