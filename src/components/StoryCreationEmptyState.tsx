import { BookOpen, FilePlus2 } from "lucide-react";

export function StoryCreationEmptyState({
  kind,
  onOpenStories,
}: {
  kind: "story" | "sequence";
  onOpenStories?: () => void;
}) {
  const story = kind === "story";
  return (
    <section
      className="story-creation-empty-state"
      data-onboarding-target={story ? "pathbranching.story-empty-state" : "pathbranching.sequence-empty-state"}
    >
      <div className="story-creation-empty-icon" aria-hidden="true">
        {story ? <BookOpen size={23} /> : <FilePlus2 size={23} />}
      </div>
      <p className="eyebrow">PathBranching</p>
      <h2>{story ? "Create a story to start building your narrative." : "Create a sequence to define the first part of your story."}</h2>
      <p>{story ? "Open Stories and create your first story to begin." : "A sequence is the first playable part of a story and will appear on the canvas."}</p>
      {story && onOpenStories ? (
        <button type="button" onClick={onOpenStories} data-onboarding-target="pathbranching.open-stories">
          Open Stories
        </button>
      ) : null}
    </section>
  );
}
