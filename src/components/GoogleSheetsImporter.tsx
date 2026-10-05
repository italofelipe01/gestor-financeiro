import { AppStatus } from '../types';
import PasteImportPanel from './sheets/PasteImportPanel';
import ServiceAccountPanel from './sheets/ServiceAccountPanel';
import SheetConnectionPanel from './sheets/SheetConnectionPanel';

interface GoogleSheetsImporterProps {
  status: AppStatus | null;
  syncing: boolean;
  currentCount: number;
  onSync: () => void;
  onChanged: () => Promise<unknown>;
  notify: (type: 'success' | 'error', text: string) => void;
}

/** Aba Planilha: conexao (link publico ou API), conta de servico e a importacao manual. */
export default function GoogleSheetsImporter({ status, syncing, currentCount, onSync, onChanged, notify }: GoogleSheetsImporterProps) {
  const sheetConnected = !!status?.sheets.connected;

  return (
    <div className="space-y-6 motion-safe:animate-fade-in" id="google-sheets-importer-view">
      <SheetConnectionPanel sheets={status?.sheets ?? null} syncing={syncing} onSync={onSync} onChanged={onChanged} notify={notify} />
      <ServiceAccountPanel
        serviceAccount={status?.serviceAccount ?? null}
        sheetConnected={sheetConnected}
        onChanged={onChanged}
        notify={notify}
      />
      <PasteImportPanel sheetConnected={sheetConnected} currentCount={currentCount} onChanged={onChanged} notify={notify} />
    </div>
  );
}
