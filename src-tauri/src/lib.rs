use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::menu::{
    Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFilePayload {
    path: String,
    content: String,
    modified_ms: Option<u128>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UniverseFilePayload {
    relative_path: String,
    absolute_path: String,
    content: String,
    modified_ms: Option<u128>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UniverseReadError {
    relative_path: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UniverseReadResult {
    root_path: String,
    files: Vec<UniverseFilePayload>,
    directories: Vec<String>,
    errors: Vec<UniverseReadError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    ok: bool,
    path: String,
    modified_ms: Option<u128>,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatus {
    ok: bool,
    runtime: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetMetadata {
    name: String,
    path: String,
    kind: String,
    extension: Option<String>,
    size: Option<u64>,
}

fn menu_item(
    app: &tauri::AppHandle,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &menu_item(app, "pb:file:open", "Open Universe...", Some("CmdOrCtrl+O"))?,
            &menu_item(app, "pb:file:save", "Save Event Edits", Some("CmdOrCtrl+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(
                app,
                "pb:file:export-runtime",
                "Export Runtime Package...",
                Some("CmdOrCtrl+E"),
            )?,
            &menu_item(app, "pb:file:export-ink", "Export Ink...", None)?,
            &menu_item(
                app,
                "pb:file:export-game-data",
                "Export SINPO GameData...",
                None,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &menu_item(app, "pb:edit:undo", "Undo", Some("CmdOrCtrl+Z"))?,
            &menu_item(app, "pb:edit:redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let style_menu = Submenu::with_items(
        app,
        "Style",
        true,
        &[
            &menu_item(app, "pb:style:worldnotion", "WorldNotion", None)?,
            &menu_item(app, "pb:style:github", "GitHub", None)?,
            &menu_item(app, "pb:style:one", "One Pro", None)?,
            &menu_item(app, "pb:style:dracula", "Dracula", None)?,
            &menu_item(app, "pb:style:owl", "Owl", None)?,
            &menu_item(app, "pb:style:material", "Material", None)?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(
                app,
                "pb:style:toggle-mode",
                "Toggle Light/Dark",
                Some("CmdOrCtrl+Shift+T"),
            )?,
        ],
    )?;

    let view_menu = Submenu::with_items(
      app,
      "View",
      true,
      &[
            &menu_item(app, "pb:view:reload", "Reload View", Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "pb:view:home", "Home", Some("CmdOrCtrl+1"))?,
            &menu_item(app, "pb:view:workspace", "Workspace", Some("CmdOrCtrl+2"))?,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(
                app,
                "pb:view:toggle-explorer",
                "Toggle Explorer Panel",
                Some("CmdOrCtrl+Shift+C"),
            )?,
            &menu_item(
                app,
                "pb:view:toggle-outline",
                "Toggle Story Outline Panel",
                Some("CmdOrCtrl+Shift+F"),
            )?,
            &menu_item(
                app,
                "pb:view:toggle-assets",
                "Toggle Assets Panel",
                Some("CmdOrCtrl+Shift+D"),
            )?,
            &menu_item(
                app,
                "pb:view:toggle-logic",
                "Toggle Logic Panel",
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &menu_item(
                app,
                "pb:view:toggle-export",
                "Toggle Export Panel",
                Some("CmdOrCtrl+Shift+E"),
            )?,
            &menu_item(app, "pb:view:toggle-connect", "Toggle Connect Panel", None)?,
            &PredefinedMenuItem::separator(app)?,
            &style_menu,
            &PredefinedMenuItem::separator(app)?,
            &menu_item(app, "pb:view:reset-layout", "Reset Layout", None)?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[
            &menu_item(app, "pb:help:about", "About Everend PathBranching", None)?,
            &menu_item(app, "pb:help:docs", "Everend Docs", None)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

fn modified_ms(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn write_text_file(path: &Path, content: &str) -> WriteResult {
    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return WriteResult {
                ok: false,
                path: path.to_string_lossy().to_string(),
                modified_ms: modified_ms(path),
                message: Some(error.to_string()),
            };
        }
    }
    let result = fs::File::create(path).and_then(|mut file| file.write_all(content.as_bytes()));
    WriteResult {
        ok: result.is_ok(),
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(path),
        message: result.err().map(|error| error.to_string()),
    }
}

fn open_in_system(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening folders is not supported on this platform.".to_string())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize_relative_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty()
        || path.contains('\0')
        || path.contains('\\')
        || path.starts_with('/')
        || path.contains(':')
    {
        return Err("Universe paths must be safe relative paths.".to_string());
    }
    let mut normalized = PathBuf::new();
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err("Universe paths cannot contain empty or traversal segments.".to_string());
        }
        normalized.push(segment);
    }
    Ok(normalized)
}

fn should_read_universe_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("md" | "json" | "yaml" | "yml")
    )
}

fn should_walk_universe_dir(root: &Path, path: &Path) -> bool {
    let relative = relative_path(root, path);
    if relative == "." {
        return true;
    }
    if relative == ".everend" {
        return true;
    }
    if relative.starts_with(".everend/.pathbranching") {
        return true;
    }
    if relative.starts_with(".everend/templates") {
        return true;
    }
    if relative.starts_with(".everend/settings") {
        return true;
    }
    if relative.starts_with(".everend/assets") {
        return true;
    }

    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    !name.starts_with('.')
}

fn asset_kind(path: &Path) -> &'static str {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" => "image",
        "mp4" | "mov" | "webm" | "mkv" | "avi" => "video",
        "mp3" | "wav" | "ogg" | "m4a" | "flac" | "aac" => "audio",
        "md" | "markdown" | "txt" | "pdf" | "doc" | "docx" | "rtf" | "odt" => "document",
        _ => "other",
    }
}

fn asset_metadata(root: &Path, path: &Path) -> AssetMetadata {
    AssetMetadata {
        name: path.file_name().and_then(|value| value.to_str()).unwrap_or("asset").to_string(),
        path: relative_path(root, path),
        kind: asset_kind(path).to_string(),
        extension: path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()),
        size: fs::metadata(path).ok().map(|metadata| metadata.len()),
    }
}

fn walk_canon_assets(root: &Path, current: &Path, assets: &mut Vec<AssetMetadata>) {
    let Ok(entries) = fs::read_dir(current) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        let relative = relative_path(root, &path);
        if relative.starts_with(".everend") { continue; }
        if path.is_dir() {
            walk_canon_assets(root, &path, assets);
        } else {
            assets.push(asset_metadata(root, &path));
        }
    }
}

fn walk_universe(
    root: &Path,
    current: &Path,
    files: &mut Vec<UniverseFilePayload>,
    directories: &mut Vec<String>,
    errors: &mut Vec<UniverseReadError>,
) {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(error) => {
            errors.push(UniverseReadError {
                relative_path: relative_path(root, current),
                message: error.to_string(),
            });
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                errors.push(UniverseReadError {
                    relative_path: relative_path(root, current),
                    message: error.to_string(),
                });
                continue;
            }
        };
        let path = entry.path();
        if path.is_dir() {
            if !should_walk_universe_dir(root, &path) {
                continue;
            }
            directories.push(relative_path(root, &path));
            walk_universe(root, &path, files, directories, errors);
            continue;
        }
        if !should_read_universe_file(&path) {
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(content) => files.push(UniverseFilePayload {
                relative_path: relative_path(root, &path),
                absolute_path: path.to_string_lossy().to_string(),
                content,
                modified_ms: modified_ms(&path),
            }),
            Err(error) => errors.push(UniverseReadError {
                relative_path: relative_path(root, &path),
                message: error.to_string(),
            }),
        }
    }
}

fn read_universe(root: PathBuf) -> Result<UniverseReadResult, String> {
    if !root.exists() {
        return Err(format!("Universe path does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Universe path is not a directory: {}", root.display()));
    }

    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut errors = Vec::new();
    walk_universe(&root, &root, &mut files, &mut directories, &mut errors);
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    directories.sort();

    Ok(UniverseReadResult {
        root_path: root.to_string_lossy().to_string(),
        files,
        directories,
        errors,
    })
}

#[tauri::command]
fn bridge_status() -> BridgeStatus {
    BridgeStatus {
        ok: true,
        runtime: "tauri".to_string(),
        message: "Everend PathBranching desktop bridge is available.".to_string(),
    }
}

#[tauri::command]
async fn open_universe_dialog(app: tauri::AppHandle) -> Result<Option<UniverseReadResult>, String> {
    let Some(folder_path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = folder_path.into_path().map_err(|error| error.to_string())?;
    read_universe(path).map(Some)
}

#[tauri::command]
fn read_universe_folder(path: String) -> Result<UniverseReadResult, String> {
    read_universe(PathBuf::from(path))
}

#[tauri::command]
fn index_canon_assets(universe_path: String) -> Result<Vec<AssetMetadata>, String> {
    let root = PathBuf::from(universe_path);
    if !root.is_dir() {
        return Err("Universe path must be an existing directory.".to_string());
    }
    let mut assets = Vec::new();
    walk_canon_assets(&root, &root, &mut assets);
    assets.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(assets)
}

#[tauri::command]
async fn import_universe_assets(
    app: tauri::AppHandle,
    universe_path: String,
) -> Result<Vec<AssetMetadata>, String> {
    let root = PathBuf::from(universe_path);
    if !root.is_dir() {
        return Err("Universe path must be an existing directory.".to_string());
    }
    let Some(files) = app.dialog().file().blocking_pick_files() else {
        return Ok(Vec::new());
    };
    let mut imported = Vec::new();
    for file in files {
        let source = file.into_path().map_err(|error| error.to_string())?;
        if !source.is_file() { continue; }
        let file_name = source.file_name().ok_or_else(|| "Imported files need a file name.".to_string())?;
        let kind = asset_kind(&source);
        let target_dir = root.join(".everend").join("assets").join(kind);
        fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
        let stem = source.file_stem().and_then(|value| value.to_str()).unwrap_or("asset");
        let extension = source.extension().and_then(|value| value.to_str());
        let mut target = target_dir.join(file_name);
        let mut suffix = 1_u32;
        while target.exists() {
            let name = match extension {
                Some(extension) => format!("{}-{}.{}", stem, suffix, extension),
                None => format!("{}-{}", stem, suffix),
            };
            target = target_dir.join(name);
            suffix += 1;
        }
        fs::copy(&source, &target).map_err(|error| error.to_string())?;
        imported.push(asset_metadata(&root, &target));
    }
    Ok(imported)
}

#[tauri::command]
fn save_universe_text_file(
    universe_path: String,
    relative_path: String,
    content: String,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    let root = PathBuf::from(&universe_path);
    if !root.exists() {
        return Err(format!("Universe path does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Universe path is not a directory: {}", root.display()));
    }
    let relative = normalize_relative_path(&relative_path)?;
    let path = root.join(relative);
    if let (Some(expected), Some(current)) = (expected_modified_ms, modified_ms(&path)) {
        if expected != current {
            return Ok(WriteResult {
                ok: false,
                path: path.to_string_lossy().to_string(),
                modified_ms: Some(current),
                message: Some("Universe file changed on disk. Reopen before overwriting.".to_string()),
            });
        }
    }
    Ok(write_text_file(&path, &content))
}

#[tauri::command]
async fn open_project_dialog(app: tauri::AppHandle) -> Result<Option<ProjectFilePayload>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("PathBranching Project", &["pathbranching.json", "json"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    Ok(Some(ProjectFilePayload {
        path: path.to_string_lossy().to_string(),
        content,
        modified_ms: modified_ms(&path),
    }))
}

#[tauri::command]
fn save_project_file(
    path: String,
    content: String,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    let path_ref = Path::new(&path);
    if let (Some(expected), Some(current)) = (expected_modified_ms, modified_ms(path_ref)) {
        if expected != current {
            return Ok(WriteResult {
                ok: false,
                path,
                modified_ms: Some(current),
                message: Some(
                    "Project file changed on disk. Save into a universe or reopen before overwriting."
                        .to_string(),
                ),
            });
        }
    }
    Ok(write_text_file(path_ref, &content))
}

#[tauri::command]
fn read_project_file(path: String) -> Result<ProjectFilePayload, String> {
    let path = Path::new(&path);
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(ProjectFilePayload {
        path: path.to_string_lossy().to_string(),
        content,
        modified_ms: modified_ms(path),
    })
}

#[tauri::command]
fn reveal_universe(path: String) -> Result<WriteResult, String> {
    let path_ref = Path::new(&path);
    if !path_ref.is_dir() {
        return Err(format!("Universe path is not a directory: {}", path_ref.display()));
    }
    open_in_system(path_ref)?;
    Ok(WriteResult {
        ok: true,
        path,
        modified_ms: None,
        message: None,
    })
}

#[tauri::command]
async fn save_project_as_dialog(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<WriteResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("PathBranching Project", &["pathbranching.json", "json"])
        .set_file_name(default_name)
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    Ok(Some(write_text_file(&path, &content)))
}

#[tauri::command]
async fn export_runtime_dialog(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<WriteResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Runtime Package", &["json"])
        .set_file_name(default_name)
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    Ok(Some(write_text_file(&path, &content)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id.starts_with("pb:") {
                let _ = app.emit("pathbranching-menu", id);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            open_universe_dialog,
            read_universe_folder,
            index_canon_assets,
            import_universe_assets,
            save_universe_text_file,
            open_project_dialog,
            read_project_file,
            save_project_file,
            save_project_as_dialog,
            reveal_universe,
            export_runtime_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Everend PathBranching");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH as STD_UNIX_EPOCH};

    fn temp_universe() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(STD_UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "pathbranching-read-universe-test-{}-{}",
            std::process::id(),
            suffix
        ));
        fs::create_dir_all(&path).expect("temp universe should be created");
        path
    }

    fn write_fixture(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("fixture parent should be created");
        }
        fs::write(path, content).expect("fixture file should be written");
    }

    fn read_paths(root: &Path) -> Vec<String> {
        read_universe(root.to_path_buf())
            .expect("universe should be readable")
            .files
            .into_iter()
            .map(|file| file.relative_path)
            .collect()
    }

    #[test]
    fn read_universe_includes_pathbranching_metadata() {
        let root = temp_universe();
        write_fixture(&root, ".everend/universe.json", r#"{"name":"Test Universe"}"#);
        write_fixture(
            &root,
            ".everend/.pathbranching/manifest.json",
            r#"{"version":"0.2","activeStoryId":"story-a","stories":[{"id":"story-a","name":"Story A","path":".everend/.pathbranching/stories/story-a/story.json"}]}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/stories/story-a/story.json",
            r#"{"storageVersion":"0.2","storyId":"story-a","sequenceIds":["sequence-a"]}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/stories/story-a/sequences/sequence-a/sequence.json",
            r#"{"storageVersion":"0.2","sequence":{"id":"sequence-a","name":"Sequence A","entryEventId":"event-a","eventIds":["event-a"],"branchIds":["branch-a"]}}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/stories/story-a/sequences/sequence-a/events/event-a.json",
            r#"{"storageVersion":"0.2","event":{"id":"event-a","name":"Event A","type":"normal","text":{"format":"plain","content":"Hello"},"canonRefs":[],"transitions":[]}}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/stories/story-a/sequences/sequence-a/branches/branch-a.json",
            r#"{"storageVersion":"0.2","branch":{"id":"branch-a","title":"Branch A","eventIds":["event-a"]}}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/stories/story-a/authoring/canvas.json",
            r#"{"storageVersion":"0.2","storyId":"story-a","canvas":{"activeSequenceId":"sequence-a"}}"#,
        );
        write_fixture(
            &root,
            ".everend/.pathbranching/working-copies/lore-origin.md",
            "# Working copy\n",
        );

        let paths = read_paths(&root);
        fs::remove_dir_all(&root).ok();

        assert!(paths.contains(&".everend/universe.json".to_string()));
        assert!(paths.contains(&".everend/.pathbranching/manifest.json".to_string()));
        assert!(paths.contains(&".everend/.pathbranching/stories/story-a/story.json".to_string()));
        assert!(paths.contains(
            &".everend/.pathbranching/stories/story-a/sequences/sequence-a/sequence.json"
                .to_string()
        ));
        assert!(paths.contains(
            &".everend/.pathbranching/stories/story-a/sequences/sequence-a/events/event-a.json"
                .to_string()
        ));
        assert!(paths.contains(
            &".everend/.pathbranching/stories/story-a/sequences/sequence-a/branches/branch-a.json"
                .to_string()
        ));
        assert!(paths.contains(
            &".everend/.pathbranching/stories/story-a/authoring/canvas.json".to_string()
        ));
        assert!(paths.contains(
            &".everend/.pathbranching/working-copies/lore-origin.md".to_string()
        ));
    }

    #[test]
    fn read_universe_ignores_unapproved_hidden_directories() {
        let root = temp_universe();
        write_fixture(&root, "Lore/Origin.md", "# Origin\n");
        write_fixture(&root, ".git/config.json", r#"{"private":true}"#);
        write_fixture(&root, ".cache/cache.json", r#"{"private":true}"#);
        write_fixture(&root, ".hidden/data.json", r#"{"private":true}"#);
        write_fixture(&root, ".everend/.secret/data.json", r#"{"private":true}"#);
        write_fixture(&root, ".everend/.pathbranching/manifest.json", r#"{"stories":[]}"#);

        let paths = read_paths(&root);
        fs::remove_dir_all(&root).ok();

        assert!(paths.contains(&"Lore/Origin.md".to_string()));
        assert!(paths.contains(&".everend/.pathbranching/manifest.json".to_string()));
        assert!(!paths.iter().any(|path| path.starts_with(".git/")));
        assert!(!paths.iter().any(|path| path.starts_with(".cache/")));
        assert!(!paths.iter().any(|path| path.starts_with(".hidden/")));
        assert!(!paths.iter().any(|path| path.starts_with(".everend/.secret/")));
    }
}
