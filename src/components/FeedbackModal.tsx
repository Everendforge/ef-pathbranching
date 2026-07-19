import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageSquareText, X } from "lucide-react";
import { feedbackUrl } from "../feedback.js";

type FeedbackModalProps = {
  screen: string;
  onClose: () => void;
  onOpenExternal: (url: string) => unknown;
};

export function FeedbackModal({ screen, onClose, onOpenExternal }: FeedbackModalProps) {
  const [frameError, setFrameError] = useState(false);
  const sourceUrl = useMemo(() => feedbackUrl(screen), [screen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="feedback-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="feedback-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="feedback-modal-header">
          <div className="feedback-modal-heading">
            <span className="feedback-modal-icon" aria-hidden="true"><MessageSquareText size={18} /></span>
            <div>
              <h2 id="feedback-modal-title">Enviar feedback</h2>
              <p>Ayúdanos a mejorar esta app.</p>
            </div>
          </div>
          <button type="button" className="feedback-modal-close" onClick={onClose} aria-label="Cerrar feedback">
            <X size={18} />
          </button>
        </header>

        <div className="feedback-modal-frame-wrap">
          <iframe
            className="feedback-modal-frame"
            title="Formulario para enviar feedback"
            src={sourceUrl}
            onError={() => setFrameError(true)}
          />
          {frameError ? (
            <div className="feedback-modal-frame-error" role="alert">
              <strong>No se pudo cargar el formulario.</strong>
              <span>Comprueba tu conexión o ábrelo en el navegador.</span>
              <button type="button" className="feedback-modal-link" onClick={() => void onOpenExternal(sourceUrl)}>
                Abrir en navegador <ExternalLink size={14} />
              </button>
            </div>
          ) : null}
        </div>

        <footer className="feedback-modal-footer">
          <span>El envío es anónimo si no dejas un correo.</span>
          <button type="button" className="feedback-modal-link" onClick={() => void onOpenExternal(sourceUrl)}>
            Abrir en navegador <ExternalLink size={14} />
          </button>
        </footer>
      </section>
    </div>
  );
}
