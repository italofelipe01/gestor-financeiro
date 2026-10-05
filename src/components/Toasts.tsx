import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface Toast {
  id: number;
  type: 'success' | 'error';
  text: string;
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** Avisos curtos no canto da tela, no lugar do alert() do navegador. */
export default function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 z-[60] flex flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`motion-safe:animate-fade-in flex items-start gap-3 rounded-xl border p-3 pr-2 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-white border-emerald-200 text-gray-800'
              : 'bg-white border-rose-200 text-gray-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-status-good shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="w-5 h-5 text-status-critical shrink-0" aria-hidden />
          )}
          <span className="flex-1 font-medium leading-snug">{toast.text}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
