import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActionButton, Checkbox, Picker, PickerItem, Text } from '@react-spectrum/s2';
import Checkmark from '@react-spectrum/s2/icons/Checkmark';
import Copy from '@react-spectrum/s2/icons/Copy';
import * as layout from './layout';

export function Choice({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
  compact = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Picker
      id={id}
      label={label}
      value={value || null}
      onChange={(key) => key !== null && onChange(String(key))}
      isDisabled={disabled}
      styles={compact ? layout.picker : layout.fullWidth}
    >
      {options.map(([value, label]) => (
        <PickerItem id={value} key={value}>
          {label}
        </PickerItem>
      ))}
    </Picker>
  );
}
export function Check({
  id,
  children,
  checked,
  onChange,
}: {
  id: string;
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox id={id} isSelected={checked} onChange={onChange}>
      {children}
    </Checkbox>
  );
}
export function CopyButton({
  id,
  text,
  label = 'Copy code',
  ariaLabel,
}: {
  id?: string;
  text: string;
  label?: string;
  ariaLabel?: string;
}) {
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied');
    } catch {
      setStatus('Select text to copy');
    }
  };
  return (
    <ActionButton id={id} aria-label={ariaLabel} onPress={() => void copy()}>
      {status === 'Copied' ? <Checkmark /> : <Copy />}
      <Text>{status || label}</Text>
    </ActionButton>
  );
}
