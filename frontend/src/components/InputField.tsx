type InputFieldProps = {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function InputField({ label, type, value, onChange, placeholder }: InputFieldProps) {
  return (
    <div>
      <label className="block font-mono text-xs mb-1" style={{ color: 'var(--color-ink-muted)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm w-full px-3 py-2 bg-[var(--color-surface-strong)]"
        style={{ border: '1px solid var(--color-border)', borderRadius: '6px', outline: 'none' }}
      />
    </div>
  )
}
