import { React, type Registrar } from "/modules/stdlib/mod.ts";
import { Button, SettingsButtonRow, SettingsRow, SettingsSection, SettingsToggleRow } from "/modules/stdlib/lib/primitives.tsx";

import { statusLabel, type ModelStore } from "./model-store.ts";

export interface GenreSettingsDeps {
  store: ModelStore;
  getEnabled(): boolean;
  setEnabled(v: boolean): void;
  clearCache(): Promise<void>;
  getColumnEnabled(): boolean;
  setColumnEnabled(v: boolean): void;
}

function ModelStatusRow({ store }: { store: ModelStore }) {
  const [status, setStatus] = React.useState(store.status);
  React.useEffect(() => {
    setStatus(store.status());
    return store.subscribe(setStatus);
  }, [store]);
  return (
    <SettingsRow label="Model">
      <span>{statusLabel(status)}</span>
      {status.state === "failed" ? (
        <Button variant="secondary" onClick={() => void store.download()}>
          Retry
        </Button>
      ) : null}
    </SettingsRow>
  );
}

function GenreSettings({ deps }: { deps: GenreSettingsDeps }) {
  const [clearing, setClearing] = React.useState(false);
  return (
    <SettingsSection title="Genres">
      <SettingsToggleRow
        label="Show genres column in playlists"
        getValue={deps.getColumnEnabled}
        onChange={deps.setColumnEnabled}
      />
      <SettingsToggleRow
        label="Infer genres from audio previews when MusicBrainz has none"
        getValue={deps.getEnabled}
        onChange={(value) => {
          deps.setEnabled(value);
          if (value) void deps.store.download(); // AC41
        }}
      />
      <ModelStatusRow store={deps.store} />
      <SettingsButtonRow
        label="Clear genre cache"
        buttonLabel={clearing ? "Clearing…" : "Clear"}
        disabled={clearing}
        onClick={() => {
          setClearing(true);
          void deps.clearCache().finally(() => setClearing(false));
        }}
      />
    </SettingsSection>
  );
}

/** "Genres" section in the Spicetify settings page (AC31, AC41). */
export function registerGenreSettings(registrar: Registrar, deps: GenreSettingsDeps): void {
  registrar.register("settingsSection", <GenreSettings deps={deps} />);
}
