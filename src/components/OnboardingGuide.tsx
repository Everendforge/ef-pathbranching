import { Check, ChevronRight, X } from "lucide-react";

export function OnboardingGuide({
  steps,
  onDismiss,
  onRestart,
  onOpenStories,
}: {
  steps: Array<{ id: string; title: string; description: string; complete: boolean }>;
  onDismiss: () => void;
  onRestart: () => void;
  onOpenStories: () => void;
}) {
  const activeIndex = steps.findIndex((step) => !step.complete);
  const complete = activeIndex === -1;
  const current = complete ? steps[steps.length - 1] : steps[activeIndex];
  if (!current) return null;
  return (
    <aside className="onboarding-guide" aria-label="PathBranching onboarding guide">
      <header className="onboarding-guide-header">
        <div>
          <p className="eyebrow">Guía de PathBranching</p>
          <strong>{complete ? "Fundamentos completados" : current.title}</strong>
        </div>
        <button type="button" className="onboarding-guide-close" onClick={onDismiss} aria-label="Cerrar guía"><X size={15} /></button>
      </header>
      <p className="onboarding-guide-description">{complete ? "Ya conoces el flujo mínimo para comenzar una historia." : current.description}</p>
      {!complete && current.id === "open-stories" ? <button type="button" onClick={onOpenStories}>Open Stories</button> : null}
      <ol className="onboarding-guide-steps">
        {steps.map((step, index) => <li key={step.id} className={`${step.complete ? "complete" : ""} ${index === activeIndex ? "active" : ""}`}><span className="onboarding-guide-step-icon">{step.complete ? <Check size={12} /> : index + 1}</span><span>{step.title}</span>{index === activeIndex ? <ChevronRight size={13} /> : null}</li>)}
      </ol>
      {complete ? <button type="button" className="onboarding-guide-restart" onClick={onRestart}>Repetir guía</button> : <small className="onboarding-guide-progress">{steps.filter((step) => step.complete).length} de {steps.length} pasos completados</small>}
    </aside>
  );
}
