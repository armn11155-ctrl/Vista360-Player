import { CLIENT_AVATAR_OPTIONS, ClientAvatar } from "./ClientAvatar";

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export function ClientAvatarPicker({ name, value, onChange }: Props) {
  return (
    <div className="client-avatar-picker" role="radiogroup" aria-label="Avatar del cliente">
      {CLIENT_AVATAR_OPTIONS.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            className={`client-avatar-option ${active ? "active" : ""}`}
            onClick={() => onChange(option.key)}
            aria-pressed={active}
          >
            <span className="client-avatar-option-art">
              <ClientAvatar name={name || option.label} avatarKey={option.key} size={40} />
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
