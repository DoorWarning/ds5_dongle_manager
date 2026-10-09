import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChoiceControlProps<Value extends number> {
  label: string;
  description?: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string }>;
  disabled?: boolean;
  onChange: (value: Value) => void;
}

/** Segmented picker for small enum fields (mic/speaker routing, GPIO mode, ...). */
export function ChoiceControl<Value extends number>({
  label,
  description,
  value,
  options,
  disabled = false,
  onChange,
}: ChoiceControlProps<Value>) {
  return (
    <div className={`control-row control-row-plain ${disabled ? "is-disabled" : ""}`}>
      <strong>{label}</strong>
      {description && <em>{description}</em>}
      <Tabs
        value={String(value)}
        onValueChange={(next) => {
          if (!disabled) {
            onChange(Number(next) as Value);
          }
        }}
        className="w-full"
      >
        <TabsList className="grid h-10 w-full" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
          {options.map((option) => (
            <TabsTrigger key={option.value} value={String(option.value)} disabled={disabled} className="h-8 text-sm font-bold">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
