import pathbranchingIcon from "../assets/pathbranching-icon.png";

export function BrandLoadingScreen({ message = "Preparing your story flow…" }: { message?: string }) {
  return (
    <main className="brand-loading brand-loading-pathbranching" role="status" aria-live="polite" aria-busy="true">
      <div className="brand-loading-orbit" aria-hidden="true" />
      <div className="brand-loading-content">
        <div className="brand-loading-mark" aria-hidden="true">
          <span className="brand-loading-mark-glow" />
          <img src={pathbranchingIcon} alt="" />
        </div>
        <h1>Pathbranching</h1>
        <p>Story-flow authoring workspace</p>
        <div className="brand-loading-status">
          <span className="brand-loading-pulse" aria-hidden="true" />
          <span>{message}</span>
        </div>
      </div>
    </main>
  );
}
