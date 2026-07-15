import { CLIENT_AVATAR_OPTIONS, ClientAvatar } from "./ClientAvatar";

interface Props {
  name: string;
  value: string;
  onChange: (value: string) => void;
  avatarUrl?: string;
  onAvatarFile?: (file: File) => void;
  uploading?: boolean;
}

export function ClientAvatarPicker({ name, value, onChange, avatarUrl, onAvatarFile, uploading }: Props) {
  return (
    <>
      {onAvatarFile && (
        <label className={`client-avatar-upload ${avatarUrl ? "has-image" : ""}`}>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onAvatarFile(file);
              event.currentTarget.value = "";
            }}
          />
          <span className="client-avatar-upload-preview">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <ClientAvatar name={name || "Cliente"} avatarKey={value} size={42} />}
          </span>
          <span className="client-avatar-upload-copy">
            <strong>{uploading ? "Convirtiendo a WebP..." : avatarUrl ? "Foto WebP lista" : "Subir foto o logo"}</strong>
            <small>Se recorta 1:1 y queda liviana para perfil.</small>
          </span>
        </label>
      )}
      <div className="client-avatar-picker" role="radiogroup" aria-label="Avatar del cliente">
        {CLIENT_AVATAR_OPTIONS.map((option) => {
          const active = value === option.key && !avatarUrl;
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
    </>
  );
}
