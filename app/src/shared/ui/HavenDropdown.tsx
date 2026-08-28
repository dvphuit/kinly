import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { HavenPopup } from './HavenPopup';

export interface HavenDropdownOption<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

export interface HavenDropdownProps<T extends string | number = string> {
  label: string;
  value: T;
  options: readonly HavenDropdownOption<T>[] | HavenDropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  id?: string;
}

export function HavenDropdown<T extends string | number = string>({
  label,
  value,
  options,
  onChange,
  className = '',
  triggerClassName = '',
  align = 'start',
  disabled = false,
  id,
}: HavenDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selected?.icon;

  return (
    <HavenPopup
      open={open && !disabled}
      onOpenChange={(nextOpen) => {
        if (!disabled) setOpen(nextOpen);
      }}
      ariaLabel={label}
      align={align}
      className={`haven-dropdown ${className}`.trim()}
      trigger={(triggerProps) => (
        <button
          id={id}
          type="button"
          className={`haven-dropdown-trigger ${triggerClassName}`.trim()}
          aria-label={`${label}: ${selected?.label ?? ''}`}
          disabled={disabled}
          {...triggerProps}
          onClick={disabled ? undefined : triggerProps.onClick}
        >
          {SelectedIcon && <SelectedIcon size={15} className="haven-dropdown-trigger-icon" aria-hidden="true" />}
          <span className="haven-dropdown-trigger-label">{selected?.label ?? ''}</span>
          <ChevronDown size={14} className={`haven-dropdown-chevron ${open ? 'is-open' : ''}`.trim()} aria-hidden="true" />
        </button>
      )}
    >
      <div className="haven-dropdown-menu" role="listbox" aria-label={label}>
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              className={`haven-dropdown-option ${isSelected ? 'selected' : ''}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {Icon && <span className="haven-dropdown-option-icon"><Icon size={16} /></span>}
              <span className="haven-dropdown-option-copy">
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {isSelected && <Check size={15} className="haven-dropdown-check" />}
            </button>
          );
        })}
      </div>
    </HavenPopup>
  );
}
